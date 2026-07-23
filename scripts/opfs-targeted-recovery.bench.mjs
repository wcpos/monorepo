// Benchmark: bulkWrite overhead of the targeted OPFS recovery wrapper.
//
// The wrapper (opfs-targeted-recovery.mjs) probes every written id with
// findDocumentsById before each bulkWrite. This measures that cost on the
// same rxdb-premium storage-filesystem-node rig the tests use, across
// realistic shapes: 1/10/100-doc writes into 1k/10k-doc collections, for
// both inserts (probe misses the index) and updates (probe reads bytes).
//
// Usage:
//   node scripts/opfs-targeted-recovery.bench.mjs           # full matrix
//   node scripts/opfs-targeted-recovery.bench.mjs --quick   # 1k collection only
//
// Results are relative — Node's filesystem storage is not browser OPFS —
// but the wrapper's probe goes through the identical storage API on both.

import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { getRxStorageFilesystemNode } from "rxdb-premium/plugins/storage-filesystem-node";

import { withTargetedOpfsRecovery } from "./opfs-targeted-recovery.mjs";

// The baseline is an identity wrapper (method rebinding, zero logic), not
// the raw storage: the storage's TaskQueue lingers 10ms after a write
// racing promiseWait(10) against task-added subjects, and a read enqueued
// before that race subscribes misses its notification and waits the full
// linger. Whether a caller lands before or after subscription is decided
// by microtask interleaving, and any wrapper's extra async hops flip it —
// so raw-vs-wrapped comparisons measure that scheduling artifact (~10ms
// per op) instead of the wrapper's logic. Identity-vs-wrapped isolates
// the actual probe/cache cost.
const identityWrap = (storage) => ({
  ...storage,
  async createStorageInstance(params) {
    const instance = await storage.createStorageInstance(params);
    const findDocumentsById = instance.findDocumentsById.bind(instance);
    const bulkWrite = instance.bulkWrite.bind(instance);
    instance.findDocumentsById = async (ids, withDeleted) =>
      findDocumentsById(ids, withDeleted);
    instance.bulkWrite = async (documentWrites, context) =>
      bulkWrite(documentWrites, context);
    return instance;
  },
});

const QUICK = process.argv.includes("--quick");
const COLLECTION_SIZES = QUICK ? [1000] : [1000, 10_000];
const BATCH_SIZES = [1, 10, 100];
const OPS = { 1: 200, 10: 100, 100: 30 };
const WARMUP = { 1: 20, 10: 10, 100: 3 };

const schema = {
  title: "targeted recovery bench",
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
    databaseName: "bench-db",
    collectionName: "products",
    schema,
    options: {},
    multiInstance: false,
    devMode: false,
    databaseInstanceToken: token,
  };
}

// Deterministic PRNG so baseline and wrapped runs touch the same ids.
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function document(id, sequence) {
  return {
    id,
    value: `value-${id}-${"x".repeat(120)}`,
    _deleted: false,
    _rev: `1-bench${sequence}`,
    _meta: { lwt: 1_700_000_000_000 + sequence },
    _attachments: {},
  };
}

async function seedGolden(basePath, size) {
  const instance = await getRxStorageFilesystemNode({
    basePath,
  }).createStorageInstance(storageParams(`seed-${size}`));
  const docs = new Map();
  for (let start = 0; start < size; start += 500) {
    const batch = [];
    for (let i = start; i < Math.min(start + 500, size); i += 1) {
      const doc = document(`product:${String(i).padStart(6, "0")}`, i);
      docs.set(doc.id, doc);
      batch.push({ document: doc });
    }
    const result = await instance.bulkWrite(batch, "seed");
    if (result.error.length > 0) {
      throw new Error(`seed failed: ${JSON.stringify(result.error[0])}`);
    }
  }
  await instance.close();
  return docs;
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function runConfig({ goldenPath, docs, wrapped, kind, warm, batchSize }) {
  const workPath = await mkdtemp(join(tmpdir(), "wcpos-bench-work-"));
  await rm(workPath, { recursive: true, force: true });
  await cp(goldenPath, workPath, { recursive: true });
  try {
    const rawStorage = getRxStorageFilesystemNode({ basePath: workPath });
    const storage = wrapped
      ? withTargetedOpfsRecovery(rawStorage)
      : identityWrap(rawStorage);
    const instance = await storage.createStorageInstance(
      storageParams(`bench-${kind}-${batchSize}-${wrapped ? "w" : "b"}`),
    );

    const random = mulberry32(0xc0ffee);
    const state = new Map(docs);
    const ids = [...state.keys()];
    let insertSequence = 0;

    const makeBatch = () => {
      const rows = [];
      if (kind === "insert") {
        for (let i = 0; i < batchSize; i += 1) {
          insertSequence += 1;
          rows.push({
            document: document(`bench:new:${insertSequence}`, insertSequence),
          });
        }
        return rows;
      }
      const chosen = new Set();
      while (chosen.size < batchSize) {
        chosen.add(ids[Math.floor(random() * ids.length)]);
      }
      for (const id of chosen) {
        const previous = state.get(id);
        const revision = Number(previous._rev.split("-")[0]) + 1;
        const next = {
          ...previous,
          value: `updated-${revision}-${previous.value}`.slice(0, 160),
          _rev: `${revision}-bench`,
          _meta: { lwt: previous._meta.lwt + revision },
        };
        state.set(id, next);
        rows.push({ document: next, previous });
      }
      return rows;
    };

    const writeBatch = async (rows) => {
      const result = await instance.bulkWrite(rows, "bench");
      if (result.error.length > 0) {
        throw new Error(`write failed: ${JSON.stringify(result.error[0])}`);
      }
    };

    // "warm" models RxDB's real write pipeline: the affected ids are read
    // through the storage first (conflict detection / documents loaded by the
    // UI or sync), which lets the wrapper's clean-id cache skip its
    // preflight. "cold" writes blind, so every unseen id still probes.
    const preRead = async (rows) => {
      if (!warm) return;
      await instance.findDocumentsById(
        rows.map((row) => row.document.id),
        false,
      );
    };

    for (let i = 0; i < WARMUP[batchSize]; i += 1) {
      const rows = makeBatch();
      await preRead(rows);
      await writeBatch(rows);
    }

    // Per-op latency AND sustained wall-clock throughput. The unwrapped
    // storage acks bulkWrite before persisting (task-queue flush happens
    // later), so latency alone flatters the baseline — close() drains the
    // queue, charging deferred I/O to the run that incurred it.
    const samples = [];
    const wallStarted = performance.now();
    for (let i = 0; i < OPS[batchSize]; i += 1) {
      const rows = makeBatch();
      await preRead(rows);
      const started = performance.now();
      await writeBatch(rows);
      samples.push(performance.now() - started);
    }
    await instance.close();
    const wallTotal = performance.now() - wallStarted;

    samples.sort((left, right) => left - right);
    const total = samples.reduce((sum, value) => sum + value, 0);
    return {
      mean: total / samples.length,
      median: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      ops: samples.length,
      docsPerSec: (OPS[batchSize] * batchSize) / (wallTotal / 1000),
    };
  } finally {
    await rm(workPath, { recursive: true, force: true });
  }
}

function formatMs(value) {
  return value >= 10 ? value.toFixed(1) : value.toFixed(2);
}

for (const size of COLLECTION_SIZES) {
  const goldenPath = await mkdtemp(join(tmpdir(), "wcpos-bench-golden-"));
  try {
    const docs = await seedGolden(goldenPath, size);
    console.log(`\n## Collection: ${size} docs`);
    console.log(
      "| kind | batch | baseline med (ms) | wrapped med (ms) | Δ latency (ms) | baseline p95 | wrapped p95 | baseline docs/s | wrapped docs/s | throughput Δ |",
    );
    console.log("|---|---|---|---|---|---|---|---|---|---|");
    for (const [kind, warm] of [
      ["insert-cold", false],
      ["insert-warm", true],
      ["update-cold", false],
      ["update-warm", true],
    ]) {
      const baseKind = kind.startsWith("insert") ? "insert" : "update";
      for (const batchSize of BATCH_SIZES) {
        const baseline = await runConfig({
          goldenPath,
          docs,
          wrapped: false,
          kind: baseKind,
          warm,
          batchSize,
        });
        const wrapped = await runConfig({
          goldenPath,
          docs,
          wrapped: true,
          kind: baseKind,
          warm,
          batchSize,
        });
        const deltaMedian = wrapped.median - baseline.median;
        const throughputDelta =
          ((wrapped.docsPerSec - baseline.docsPerSec) / baseline.docsPerSec) *
          100;
        console.log(
          `| ${kind} | ${batchSize} | ${formatMs(baseline.median)} | ${formatMs(
            wrapped.median,
          )} | +${formatMs(deltaMedian)} | ${formatMs(baseline.p95)} | ${formatMs(
            wrapped.p95,
          )} | ${Math.round(baseline.docsPerSec)} | ${Math.round(
            wrapped.docsPerSec,
          )} | ${throughputDelta >= 0 ? "+" : ""}${throughputDelta.toFixed(1)}% |`,
        );
      }
    }
  } finally {
    await rm(goldenPath, { recursive: true, force: true });
  }
}
