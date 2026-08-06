import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { getIndexableStringMonad } from "rxdb/plugins/core";

import { withTargetedOpfsRecovery } from "./opfs-targeted-recovery.mjs";

const SCHEMA = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 4 },
    name: { type: "string", maxLength: 4 },
    _deleted: { type: "boolean" },
    _meta: {
      type: "object",
      properties: {
        lwt: {
          type: "number",
          minimum: 1,
          maximum: 1000000000000000,
          multipleOf: 0.01,
        },
      },
    },
  },
};

const DOCUMENTS = [
  { id: "aaa", name: "a", _deleted: false, _meta: { lwt: 100 } },
  { id: "bbb", name: "b", _deleted: false, _meta: { lwt: 200 } },
  { id: "ccc", name: "c", _deleted: false, _meta: { lwt: 300 } },
];

// Index set as production actually builds it. RxDB's fillWithDefaultSettings
// prefixes `_deleted` to every schema index, and premium's getIndexesFromSchema
// then appends `['_meta.lwt', primaryPath]` and the cleanup index — so
// indexStates[0] is `_deleted`-first, which is why the live stack throws reading
// `_deleted` rather than `_meta`.
const INDEXES = [
  ["_deleted", "name", "id"],
  ["_meta.lwt", "id"],
  ["_deleted", "_meta.lwt", "id"],
];

const deepCopyRows = (rows) => rows.map((row) => [...row]);

/**
 * A faithful in-memory model of one collection's on-disk OPFS files, shared by
 * every "tab" opened over it:
 *
 *  - `documentBytes`  — the documents file. A corrupt document is whitespace;
 *    a gap models the dead space premium's compaction leaves behind.
 *  - `baseRows`       — the persisted index files, per index.
 *  - `changelog`      — the shared changelog file (position-based ops).
 *
 * The point of the model is premium's compaction contract: a successful
 * `cleanup` persists in-memory rows into `baseRows` and then EMPTIES the
 * changelog. Anything that relies on the changelog as durable evidence must
 * survive that erasure.
 */
function createSharedDisk({ documents, corruptId, gapBefore }) {
  let cursor = 0;
  const chunks = [];
  const positions = new Map();
  for (const document of documents) {
    if (document.id === gapBefore) {
      chunks.push(Buffer.alloc(8, 0x20));
      cursor += 8;
    }
    const encoded = Buffer.from(JSON.stringify(document));
    const bytes =
      document.id === corruptId
        ? Buffer.alloc(encoded.byteLength, 0x20)
        : encoded;
    chunks.push(bytes);
    positions.set(document.id, [cursor, cursor + bytes.byteLength]);
    cursor += bytes.byteLength;
  }
  const documentBytes = Buffer.concat(chunks);

  const baseRows = INDEXES.map((index) => {
    const getIndexableString = getIndexableStringMonad(SCHEMA, index);
    return documents
      .map((document) => [
        getIndexableString(document),
        ...positions.get(document.id),
      ])
      .sort((left, right) => (left[0] < right[0] ? -1 : 1));
  });

  return {
    documentBytes,
    baseRows,
    changelog: [],
    // Every "D" ever durably appended, never reset by empty() — this is what a
    // duplicate delete would inflate.
    appendedDeletes: 0,
  };
}

/**
 * A tab (its own worker, its own in-memory rows) over a shared disk. In-memory
 * rows are seeded from the base plus any pending changelog, exactly as premium
 * builds them at init.
 */
function createTab(
  disk,
  { databaseName = "shopdb", collectionName = "products" } = {},
) {
  const indexStates = INDEXES.map((index, indexId) => {
    const getIndexableString = getIndexableStringMonad(SCHEMA, index);
    return {
      indexId,
      getIndexableString,
      rows: deepCopyRows(disk.baseRows[indexId]),
      runChangelogOperation([, position, operation, row]) {
        if (operation === "D") this.rows.splice(position, 1);
        else if (operation === "A") this.rows.splice(position, 0, row);
        else this.rows[position] = row;
      },
      // Reload this index's rows from the persisted base (premium's initRead).
      async initRead() {
        this.rows = deepCopyRows(disk.baseRows[indexId]);
      },
      // Persist this index's rows back to the base (premium's persistInMemoryRows).
      persistInMemoryRows() {
        disk.baseRows[indexId] = deepCopyRows(this.rows);
      },
    };
  });
  // Seed memory from base + pending changelog.
  for (const operation of disk.changelog) {
    indexStates[operation[0]].runChangelogOperation(operation);
  }

  const lwtIndex =
    indexStates[
      INDEXES.findIndex(
        (index) =>
          index.length === 2 && index[0] === "_meta.lwt" && index[1] === "id",
      )
    ];
  const accessHandle = {
    read: async (start, end) => disk.documentBytes.subarray(start, end),
  };

  const instance = {
    primaryPath: "id",
    databaseName,
    collectionName,
    findDocumentsById: async () => "[]",
    bulkWrite: async () => ({ error: [] }),
    query: async () => JSON.stringify({ documents: [] }),
    getChangedDocumentsSince: async () => JSON.stringify({ documents: [] }),
    // premium's cleanupDocumentJsonFile: walk the _meta.lwt index; a row whose
    // bytes are whitespace parses to [] so element 0 is undefined and
    // getIndexableString throws on `_deleted`. On a clean pass it folds the
    // changelog (persist affected indexes, then EMPTY) and returns.
    cleanup: async () => {
      for (const [, start, end] of lwtIndex.rows) {
        const bytes = disk.documentBytes.subarray(start, end);
        if (bytes.toString().trim() !== "") continue;
        const document = JSON.parse(`[${bytes.toString()}]`)[0];
        for (const indexState of indexStates)
          indexState.getIndexableString(document);
      }
      const affected = new Set(disk.changelog.map((operation) => operation[0]));
      for (const indexState of indexStates) {
        if (affected.has(indexState.indexId)) indexState.persistInMemoryRows();
      }
      disk.changelog.length = 0;
      return true;
    },
    internals: {
      statePromise: Promise.resolve({
        params: { databaseName, collectionName },
        documentFileHandle: { createAccessHandle: async () => accessHandle },
        indexStates,
        changelog: {
          getChangelogOperations: async () => {
            const byIndexId = new Map();
            for (const indexState of indexStates)
              byIndexId.set(indexState.indexId, []);
            for (const operation of disk.changelog) {
              byIndexId.get(operation[0])?.push(operation);
            }
            return byIndexId;
          },
          addChangelogOperations: async (_runState, operations) => {
            disk.changelog.push(...operations);
            disk.appendedDeletes += operations.filter(
              (op) => op[2] === "D",
            ).length;
          },
        },
      }),
    },
    taskQueue: {
      runCleanup: async (operation) => operation({ accessHandlers: new Map() }),
    },
    _decode: (bytes) => bytes.toString(),
  };

  return { indexStates, instance };
}

const wrapTab = (tab, config) =>
  withTargetedOpfsRecovery({
    createStorageInstance: async () => tab.instance,
  }).createStorageInstance(config);

// --- Web Locks harness -----------------------------------------------------

/**
 * A minimal navigator.locks that serialises same-named requests, records the
 * names requested, and tracks peak concurrency (which must stay 1).
 */
function createFakeWebLocks() {
  const tails = new Map();
  const acquired = [];
  let active = 0;
  let maxConcurrent = 0;
  return {
    acquired,
    get maxConcurrent() {
      return maxConcurrent;
    },
    request(name, callback) {
      acquired.push(name);
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(async () => {
        active += 1;
        maxConcurrent = Math.max(maxConcurrent, active);
        try {
          return await callback({ name });
        } finally {
          active -= 1;
        }
      });
      tails.set(
        name,
        run.then(
          () => undefined,
          () => undefined,
        ),
      );
      return run;
    },
  };
}

function defineNavigator(value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", {
    value,
    configurable: true,
    writable: true,
  });
  return () => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  };
}

function withFakeWebLocks(locks, fn) {
  const restore = defineNavigator({ ...(globalThis.navigator ?? {}), locks });
  return (async () => {
    try {
      return await fn();
    } finally {
      restore();
    }
  })();
}

function withoutWebLocks(fn) {
  const stripped = { ...(globalThis.navigator ?? {}) };
  delete stripped.locks;
  const restore = defineNavigator(stripped);
  return (async () => {
    try {
      return await fn();
    } finally {
      restore();
    }
  })();
}

const CORRUPT = { documents: DOCUMENTS, corruptId: "bbb", gapBefore: "bbb" };

// --- Tests -----------------------------------------------------------------

test("recovers the cleanup storm on single-instance storage", async () => {
  const disk = createSharedDisk(CORRUPT);
  const tab = createTab(disk);

  // Guard the premise: the modelled cleanup throws the exact production error.
  await assert.rejects(
    () => tab.instance.cleanup(0),
    (error) =>
      error instanceof TypeError &&
      /reading '_deleted'/.test(error.message) === true,
  );

  const recovering = await wrapTab(tab, { multiInstance: false });

  // Reachable and idempotent: the retry completes and the dangling row is gone
  // from every index, one durable delete each, survivors untouched.
  assert.equal(await recovering.cleanup(0), true);
  assert.equal(disk.appendedDeletes, tab.indexStates.length);
  for (const indexState of tab.indexStates) {
    assert.equal(indexState.rows.length, 2);
  }
  await assert.doesNotReject(() => recovering.cleanup(0));
});

test("refuses whitespace-row recovery under multiInstance without Web Locks", async () => {
  await withoutWebLocks(async () => {
    const disk = createSharedDisk(CORRUPT);
    const tab = createTab(disk);
    assert.equal(globalThis.navigator?.locks, undefined);
    const recovering = await wrapTab(tab, { multiInstance: true });

    await assert.rejects(
      () => recovering.cleanup(0),
      (error) =>
        /targeted recovery refused: multi-instance/.test(error.message),
    );
    for (const indexState of tab.indexStates) {
      assert.equal(indexState.rows.length, 3);
    }
    assert.equal(disk.appendedDeletes, 0);
  });
});

test("runs the whitespace-row recovery under the cross-tab lock on web", async () => {
  const locks = createFakeWebLocks();
  await withFakeWebLocks(locks, async () => {
    const disk = createSharedDisk(CORRUPT);
    const tab = createTab(disk);
    const recovering = await wrapTab(tab, {
      multiInstance: true,
      databaseName: "shopdb",
      collectionName: "products",
    });

    assert.equal(await recovering.cleanup(0), true);
    assert.equal(
      locks.acquired.filter((n) => n === "wcpos-opfs-recovery:shopdb:products")
        .length,
      1,
    );
    assert.equal(disk.appendedDeletes, tab.indexStates.length);
    for (const indexState of tab.indexStates) {
      assert.equal(indexState.rows.length, 2);
    }
  });
});

test("two tabs sharing the storage: one durable delete, neither corrupts", async () => {
  const locks = createFakeWebLocks();
  await withFakeWebLocks(locks, async () => {
    const disk = createSharedDisk(CORRUPT);
    // Both tabs boot from the original base, so both hold the dangling row in
    // memory. The winner repairs the base AND empties the changelog (premium's
    // compaction contract), so the loser cannot lean on the changelog — it must
    // re-sync from the repaired base and find nothing left to drop.
    const tabA = createTab(disk);
    const tabB = createTab(disk);
    const config = {
      multiInstance: true,
      databaseName: "shopdb",
      collectionName: "products",
    };
    const [recoverA, recoverB] = await Promise.all([
      wrapTab(tabA, config),
      wrapTab(tabB, config),
    ]);

    await Promise.all([recoverA.cleanup(0), recoverB.cleanup(0)]);

    // Exactly one durable delete per index across BOTH tabs — never doubled.
    assert.equal(disk.appendedDeletes, tabA.indexStates.length);
    assert.equal(locks.maxConcurrent, 1);

    // The persisted base lost the dangling row and nothing else: replaying it
    // into a fresh tab yields two healthy rows per index.
    const fresh = createTab(disk);
    for (const indexState of fresh.indexStates) {
      assert.equal(indexState.rows.length, 2);
    }
    for (const tab of [tabA, tabB]) {
      for (const indexState of tab.indexStates) {
        assert.equal(indexState.rows.length, 2);
      }
    }
  });
});

test("recovery is re-runnable after a peer's partial (crash-safe) recovery", async () => {
  const locks = createFakeWebLocks();
  await withFakeWebLocks(locks, async () => {
    const disk = createSharedDisk(CORRUPT);
    // A prior tab appended its delete but crashed before the retry folded it —
    // the changelog holds an un-emptied "D" and the base still has the row.
    const crashed = createTab(disk);
    await crashed.instance.taskQueue.runCleanup(async (runState) => {
      const state = await crashed.instance.internals.statePromise;
      for (const indexState of state.indexStates) {
        let position = indexState.rows.length;
        while (position--) {
          const row = indexState.rows[position];
          const bytes = disk.documentBytes.subarray(row[1], row[2]);
          if (bytes.toString().trim() !== "") continue;
          const operation = [indexState.indexId, position, "D", row];
          indexState.runChangelogOperation(operation);
          await state.changelog.addChangelogOperations(runState, [operation]);
        }
      }
    });
    const durableDeletes = disk.appendedDeletes;
    assert.equal(durableDeletes, crashed.indexStates.length);
    assert.notEqual(disk.changelog.length, 0);

    // A fresh tab boots with the row still in its base, recovers, and must NOT
    // append a second delete: the pending changelog already removed it.
    const fresh = createTab(disk);
    const recovering = await wrapTab(fresh, {
      multiInstance: true,
      databaseName: "shopdb",
      collectionName: "products",
    });
    await recovering.cleanup(0);

    assert.equal(disk.appendedDeletes, durableDeletes);
    for (const indexState of fresh.indexStates) {
      assert.equal(indexState.rows.length, 2);
    }
    // Base repaired and changelog folded away.
    const rebooted = createTab(disk);
    for (const indexState of rebooted.indexStates) {
      assert.equal(indexState.rows.length, 2);
    }
  });
});

test("propagates a persistent cleanup error after recovery retries", async () => {
  const persistentError = new Error("quota exceeded");
  let cleanupCalls = 0;
  const documentFileHandle = {
    createAccessHandle: async () => ({ read: async () => Buffer.alloc(0) }),
  };
  const instance = {
    primaryPath: "id",
    findDocumentsById: async () => "[]",
    bulkWrite: async () => ({ error: [] }),
    query: async () => JSON.stringify({ documents: [] }),
    getChangedDocumentsSince: async () => JSON.stringify({ documents: [] }),
    cleanup: async () => {
      cleanupCalls += 1;
      throw persistentError;
    },
    internals: {
      statePromise: Promise.resolve({
        documentFileHandle,
        indexStates: [],
      }),
    },
    taskQueue: {
      runCleanup: async (operation) => operation({ accessHandlers: new Map() }),
    },
    _decode: (bytes) => bytes.toString(),
  };
  const recovering = await withTargetedOpfsRecovery({
    createStorageInstance: async () => instance,
  }).createStorageInstance({ multiInstance: false });
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await assert.rejects(
      () => recovering.cleanup(0),
      (error) => error === persistentError,
    );
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(cleanupCalls, 2);
});
