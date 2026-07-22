import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { normalizeMangoQuery, prepareQuery } from "rxdb";
import { getRxStorageFilesystemNode } from "rxdb-premium/plugins/storage-filesystem-node";

const schema = {
  title: "targeted recovery probe",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 100 },
    value: { type: "string" },
    _deleted: { type: "boolean" },
    _rev: { type: "string", minLength: 1 },
    _meta: {
      type: "object",
      properties: {
        lwt: {
          type: "number",
          minimum: 1,
          maximum: 1_000_000_000_000_000,
          multipleOf: 0.01,
        },
      },
      required: ["lwt"],
      additionalProperties: false,
    },
    _attachments: { type: "object" },
  },
  required: ["id", "value", "_deleted", "_rev", "_meta", "_attachments"],
  indexes: [["_deleted", "id"]],
};

function storageParams(token) {
  return {
    databaseName: "targeted-recovery-db",
    collectionName: "products",
    schema,
    options: {},
    multiInstance: false,
    devMode: false,
    databaseInstanceToken: token,
  };
}

function document(id, sequence) {
  return {
    id,
    value: `value-${id}`,
    _deleted: false,
    _rev: `1-recovery${sequence}`,
    _meta: { lwt: Date.now() + sequence },
    _attachments: {},
  };
}

async function corruptRecord(basePath, id, makeCorruptBytes) {
  const directory = join(basePath, (await readdir(basePath))[0]);
  const indexPaths = (await readdir(directory))
    .filter((name) => name.startsWith("index-"))
    .map((name) => join(directory, name));
  const parsedIndexes = await Promise.all(
    indexPaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
  const targetRow = parsedIndexes.flat().find((row) => row[0].includes(id));
  assert.ok(targetRow, `missing index row for ${id}`);
  const originalStart = targetRow[1];
  const originalEnd = targetRow[2];

  const documentsPath = join(directory, "documents.json");
  const documents = await readFile(documentsPath);
  const cleanRecord = documents.subarray(originalStart, originalEnd);
  const corruptRecordBytes = makeCorruptBytes
    ? makeCorruptBytes(cleanRecord)
    : Buffer.concat([cleanRecord, Buffer.from(`garbage-${id}`)]);
  const corruptStart = documents.length;
  const corruptEnd = corruptStart + corruptRecordBytes.length;
  await writeFile(
    documentsPath,
    Buffer.concat([documents, corruptRecordBytes]),
  );

  for (let index = 0; index < indexPaths.length; index += 1) {
    for (const row of parsedIndexes[index]) {
      if (row[1] === originalStart && row[2] === originalEnd) {
        row[1] = corruptStart;
        row[2] = corruptEnd;
      }
    }
    await writeFile(indexPaths[index], JSON.stringify(parsedIndexes[index]));
  }
}

async function corruptRecordInPlace(basePath, id, makeCorruptBytes) {
  const directory = join(basePath, (await readdir(basePath))[0]);
  const indexPath = join(
    directory,
    (await readdir(directory)).find((name) => name.startsWith("index-")),
  );
  const targetRow = JSON.parse(await readFile(indexPath, "utf8")).find((row) =>
    row[0].includes(id),
  );
  assert.ok(targetRow, `missing index row for ${id}`);

  const documentsPath = join(directory, "documents.json");
  const documents = await readFile(documentsPath);
  const original = documents.subarray(targetRow[1], targetRow[2]);
  const corrupt = makeCorruptBytes(original);
  assert.ok(corrupt.length <= original.length);
  const replacement = Buffer.alloc(original.length, 32);
  corrupt.copy(replacement);
  await writeFile(
    documentsPath,
    Buffer.concat([
      documents.subarray(0, targetRow[1]),
      replacement,
      documents.subarray(targetRow[2]),
    ]),
  );
}

test("exports a targeted OPFS recovery storage wrapper", async () => {
  const recoveryModule = await import("./opfs-targeted-recovery.mjs").catch(
    () => ({}),
  );

  assert.equal(typeof recoveryModule.withTargetedOpfsRecovery, "function");
});

test("falls back to singleton reads when only a combined response is malformed", async () => {
  const records = [document("cache:orders", 0), document("cache:products", 1)];
  const instance = {
    primaryPath: "id",
    findDocumentsById: async (ids) =>
      ids.length > 1
        ? "[{malformed"
        : JSON.stringify(records.filter(({ id }) => ids.includes(id))),
    bulkWrite: async () => ({ error: [] }),
    query: async () => JSON.stringify({ documents: records }),
    getChangedDocumentsSince: async () => JSON.stringify({ documents: records }),
  };
  const { withTargetedOpfsRecovery } = await import("./opfs-targeted-recovery.mjs");
  const recovering = await withTargetedOpfsRecovery({
    createStorageInstance: async () => instance,
  }).createStorageInstance(storageParams("combined-read"));

  assert.deepEqual(
    JSON.parse(
      await recovering.findDocumentsById(records.map(({ id }) => id), false),
    ),
    records,
  );
});

test("falls back to singleton writes when a combined write is malformed", async () => {
  const records = [document("cache:orders", 0), document("cache:products", 1)];
  const written = [];
  let combinedWriteAttempted = false;
  let idleAwaited = false;
  const instance = {
    primaryPath: "id",
    taskQueue: {
      awaitIdle: async () => {
        idleAwaited = true;
      },
    },
    findDocumentsById: async (ids) => (ids.length > 1 ? "[{malformed" : "[]"),
    bulkWrite: async (rows) => {
      if (rows.length > 1) {
        combinedWriteAttempted = true;
        throw new SyntaxError("malformed combined write");
      }
      written.push(rows[0].document.id);
      return { error: [] };
    },
    query: async () => JSON.stringify({ documents: [] }),
    getChangedDocumentsSince: async () => JSON.stringify({ documents: [] }),
  };
  const { withTargetedOpfsRecovery } =
    await import("./opfs-targeted-recovery.mjs");
  const recovering = await withTargetedOpfsRecovery({
    createStorageInstance: async () => instance,
  }).createStorageInstance(storageParams("combined-write"));

  const result = await recovering.bulkWrite(
    records.map((item) => ({ document: item })),
    "test",
  );

  assert.deepEqual(result, { error: [] });
  assert.equal(combinedWriteAttempted, false);
  assert.equal(idleAwaited, true);
  assert.deepEqual(
    written,
    records.map(({ id }) => id),
  );
});

test("repairs one malformed record without removing its collection siblings", async () => {
  const basePath = await mkdtemp(join(tmpdir(), "wcpos-targeted-recovery-"));
  const ids = ["product:111", "product:6660", "product:999"];
  const records = ids.map((id, index) => document(id, index));

  try {
    const rawStorage = getRxStorageFilesystemNode({ basePath });
    const initial = await rawStorage.createStorageInstance(
      storageParams("initial"),
    );
    const writeResult = await initial.bulkWrite(
      records.map((item) => ({ document: item })),
      "seed",
    );
    assert.deepEqual(writeResult.error, []);
    await initial.cleanup(0);
    await initial.close();
    await corruptRecordInPlace(basePath, "product:6660", () =>
      Buffer.from(
        `          ,{,${JSON.stringify({ ...records[1], value: "x" })}`,
      ),
    );

    const { withTargetedOpfsRecovery } =
      await import("./opfs-targeted-recovery.mjs");
    const recoveryStorage = withTargetedOpfsRecovery(
      getRxStorageFilesystemNode({ basePath }),
    );
    const recovering = await recoveryStorage.createStorageInstance(
      storageParams("recovering"),
    );
    const query = prepareQuery(
      schema,
      normalizeMangoQuery(schema, {
        selector: {},
        sort: [{ id: "asc" }],
      }),
    );
    const recovered = (await recovering.query(query)).documents;
    assert.deepEqual(
      recovered.map((item) => item.id),
      ids,
    );
    let cleaned = false;
    for (let attempt = 0; attempt < 5 && !cleaned; attempt += 1) {
      cleaned = await recovering.cleanup(0);
    }
    assert.equal(cleaned, true);
    const afterCleanup = await recovering.findDocumentsById(ids, false);
    assert.deepEqual(
      afterCleanup.map((item) => item.id),
      ids,
    );
    await recovering.close();

    await corruptRecord(basePath, "product:999");
    const syncing = await recoveryStorage.createStorageInstance(
      storageParams("syncing"),
    );
    const changed = await syncing.getChangedDocumentsSince(10);
    assert.deepEqual(
      changed.documents.map((item) => item.id).sort(),
      [...ids].sort(),
    );
    await syncing.close();

    const reopened = await getRxStorageFilesystemNode({
      basePath,
    }).createStorageInstance(storageParams("reopened"));
    const persisted = await reopened.findDocumentsById(ids, false);
    assert.deepEqual(
      persisted.map((item) => item.id),
      ids,
    );
    await reopened.close();
  } finally {
    await rm(basePath, { recursive: true, force: true });
  }
});

test("repairs a malformed record before retrying its pending write", async () => {
  const basePath = await mkdtemp(
    join(tmpdir(), "wcpos-targeted-write-recovery-"),
  );
  const openOrder = document("order:open", 0);
  const siblingOrder = document("order:sibling", 1);

  try {
    const initial = await getRxStorageFilesystemNode({
      basePath,
    }).createStorageInstance(storageParams("write-initial"));
    const seed = await initial.bulkWrite(
      [openOrder, siblingOrder].map((item) => ({ document: item })),
      "seed",
    );
    assert.deepEqual(seed.error, []);
    await initial.cleanup(0);
    await initial.close();
    await corruptRecord(basePath, openOrder.id);

    const { withTargetedOpfsRecovery } =
      await import("./opfs-targeted-recovery.mjs");
    const recoveryStorage = withTargetedOpfsRecovery(
      getRxStorageFilesystemNode({ basePath }),
    );
    const recovering = await recoveryStorage.createStorageInstance(
      storageParams("write-recovering"),
    );
    const updatedOrder = {
      ...openOrder,
      value: "updated-open-order",
      _rev: "2-recovered",
      _meta: { lwt: openOrder._meta.lwt + 100 },
    };
    const update = await recovering.bulkWrite(
      [{ document: updatedOrder, previous: openOrder }],
      "update",
    );
    assert.deepEqual(update.error, []);
    const current = await recovering.findDocumentsById(
      [openOrder.id, siblingOrder.id],
      false,
    );
    assert.equal(
      current.find((item) => item.id === openOrder.id)?.value,
      "updated-open-order",
    );
    assert.ok(current.some((item) => item.id === siblingOrder.id));
    await recovering.close();
  } finally {
    await rm(basePath, { recursive: true, force: true });
  }
});

test("refuses to recover a matching nested object as the whole document", async () => {
  const basePath = await mkdtemp(join(tmpdir(), "wcpos-targeted-refusal-"));
  const id = "product:nested";

  try {
    const initial = await getRxStorageFilesystemNode({
      basePath,
    }).createStorageInstance(storageParams("nested-initial"));
    await initial.bulkWrite([{ document: document(id, 0) }], "seed");
    await initial.cleanup(0);
    await initial.close();
    await corruptRecord(basePath, id, () =>
      Buffer.from(`{"id":"${id}","nested":{"id":"${id}"} garbage`),
    );

    const { withTargetedOpfsRecovery } =
      await import("./opfs-targeted-recovery.mjs");
    const recovering = await withTargetedOpfsRecovery(
      getRxStorageFilesystemNode({ basePath }),
    ).createStorageInstance(storageParams("nested-recovering"));
    await assert.rejects(
      recovering.findDocumentsById([id], false),
      {
        name: "SyntaxError",
        message: new RegExp(
          `targeted recovery failed for ${id}: index-mismatch$`,
        ),
      },
    );
    await recovering.close();
  } finally {
    await rm(basePath, { recursive: true, force: true });
  }
});

test("refuses a matching id whose recovered index values differ", async () => {
  const basePath = await mkdtemp(
    join(tmpdir(), "wcpos-targeted-index-refusal-"),
  );
  const id = "product:index-mismatch";

  try {
    const initial = await getRxStorageFilesystemNode({
      basePath,
    }).createStorageInstance(storageParams("index-mismatch-initial"));
    await initial.bulkWrite([{ document: document(id, 0) }], "seed");
    await initial.cleanup(0);
    await initial.close();
    await corruptRecord(basePath, id, () =>
      Buffer.from(`{"id":"${id}"}garbage`),
    );

    const { withTargetedOpfsRecovery } =
      await import("./opfs-targeted-recovery.mjs");
    const recovering = await withTargetedOpfsRecovery(
      getRxStorageFilesystemNode({ basePath }),
    ).createStorageInstance(storageParams("index-mismatch-recovering"));
    await assert.rejects(recovering.findDocumentsById([id], false), {
      name: "SyntaxError",
      message: new RegExp(
        `targeted recovery failed for ${id}: index-mismatch$`,
      ),
    });
    await recovering.close();
  } finally {
    await rm(basePath, { recursive: true, force: true });
  }
});
