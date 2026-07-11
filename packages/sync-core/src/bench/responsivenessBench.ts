import { assertBulkSuccess } from '../assertBulkSuccess';
import type { SyncCheckpoint } from '@woo-rxdb-lab/shared';
import { syncCustomPullBatchIntoRepository, type CustomPullRepository } from '../customPullAdapter';
import {
  installHiddenPageIdlePolyfill,
  startResponsivenessSampler,
  type ResponsivenessMetrics,
  type ResponsivenessSamplerDeps,
} from '../responsiveness';

/**
 * UI-responsiveness BENCH INSTRUMENT (docs/wcpos-pain-points.md, pain point
 * 1): the representative workloads (audit-diff, bulk-upsert, pull-sync), the
 * backend x workload suite that samples them with the ENGINE sampler in
 * ../responsiveness, and the markdown report. Consumes the engine strictly
 * through its public surface (sampler, polyfill, pull adapter) — deleting
 * this bench directory must never break the engine.
 *
 * Platform neutrality (ADR 0004 clean seams): sync-core never imports rxdb.
 * Database/collection creation is the HOST's job — the suite receives an
 * injected `createCollection(backendName)` returning a bulk-upsert-capable
 * collection, a CustomPullRepository over it, and a teardown. Web glue lives
 * in apps/web/src/bench/uiResponsiveness.ts; the Electron host in
 * apps/electron/src/renderer/responsiveness.ts.
 */

// ---------------------------------------------------------------------------
// Workload 1: audit-diff (synthetic Sync Audit villain — pure main-thread CPU)
// ---------------------------------------------------------------------------

export type AuditDiffBuckets = {
  unchanged: number;
  stale: number;
  missingLocal: number;
  localOnly: number;
};

export type AuditDiffDetail = {
  docsProcessed: number;
  buckets: AuditDiffBuckets;
};

export type AuditDiffParams = {
  docCount?: number;
  passes?: number;
  seed?: number;
};

const AUDIT_DIFF_DEFAULT_DOC_COUNT = 10_000;
const AUDIT_DIFF_DEFAULT_PASSES = 20;
const AUDIT_DIFF_LOCAL_ONLY_EVERY = 200;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type AuditDiffFixture = {
  serverEntries: Array<{ id: string; dateString: string }>;
  localDocs: Array<{ id: string; dateString: string }>;
};

export function buildAuditDiffFixture(docCount: number, seed = 1): AuditDiffFixture {
  const random = mulberry32(seed);
  const baseMs = Date.UTC(2026, 0, 1);
  const serverEntries: AuditDiffFixture['serverEntries'] = [];
  const localDocs: AuditDiffFixture['localDocs'] = [];

  for (let index = 0; index < docCount; index += 1) {
    const id = `woo-order:${index + 1}`;
    const dateString = new Date(baseMs + index * 1000).toISOString();
    serverEntries.push({ id, dateString });

    const roll = random();
    if (roll < 0.08) {
      // Stale local copy: server was modified after the local snapshot.
      localDocs.push({ id, dateString: new Date(baseMs + index * 1000 - 60_000).toISOString() });
    } else if (roll < 0.12) {
      // Missing locally: never synced.
    } else {
      localDocs.push({ id, dateString });
    }
    if (index % AUDIT_DIFF_LOCAL_ONLY_EVERY === 0) {
      localDocs.push({ id: `local-only:${index}`, dateString });
    }
  }

  return { serverEntries, localDocs };
}

export async function runAuditDiffWorkload(params: AuditDiffParams = {}): Promise<AuditDiffDetail> {
  const docCount = params.docCount ?? AUDIT_DIFF_DEFAULT_DOC_COUNT;
  const passes = params.passes ?? AUDIT_DIFF_DEFAULT_PASSES;
  const { serverEntries, localDocs } = buildAuditDiffFixture(docCount, params.seed ?? 1);

  let docsProcessed = 0;
  let buckets: AuditDiffBuckets = { unchanged: 0, stale: 0, missingLocal: 0, localOnly: 0 };

  for (let pass = 0; pass < passes; pass += 1) {
    // The production Sync Audit rebuilds the server map from each response,
    // then diffs every local doc against it on the main thread.
    const serverMap = new Map<string, string>();
    for (const entry of serverEntries) {
      serverMap.set(entry.id, entry.dateString);
    }

    const passBuckets: AuditDiffBuckets = { unchanged: 0, stale: 0, missingLocal: 0, localOnly: 0 };
    let matched = 0;
    for (const doc of localDocs) {
      const serverDate = serverMap.get(doc.id);
      if (serverDate === undefined) {
        passBuckets.localOnly += 1;
      } else if (serverDate === doc.dateString) {
        passBuckets.unchanged += 1;
        matched += 1;
      } else {
        passBuckets.stale += 1;
        matched += 1;
      }
    }
    passBuckets.missingLocal = serverMap.size - matched;
    buckets = passBuckets;
    docsProcessed += serverEntries.length;
  }

  return { docsProcessed, buckets };
}

// ---------------------------------------------------------------------------
// Workload 2: bulk-upsert into a provided collection
// ---------------------------------------------------------------------------

export type UiResponsivenessOrderDoc = {
  id: string;
  payload: Record<string, unknown>;
};

export type BulkUpsertCollection = {
  bulkUpsert(docs: UiResponsivenessOrderDoc[]): Promise<{ success: unknown[]; error: unknown[] }>;
};

const BULK_UPSERT_DEFAULT_DOC_COUNT = 2_000;
const ORDER_STATUSES = ['pending', 'processing', 'on-hold', 'completed'] as const;

export function generateResponsivenessOrderDocs(count: number, runStamp = 'static'): UiResponsivenessOrderDoc[] {
  const baseMs = Date.UTC(2026, 0, 1);
  return Array.from({ length: count }, (_, index) => ({
    id: `ui-resp-order:${runStamp}:${index + 1}`,
    payload: {
      number: `${index + 1}`,
      status: ORDER_STATUSES[index % ORDER_STATUSES.length],
      total: ((index % 500) + 0.99).toFixed(2),
      currency: 'AUD',
      date_modified_gmt: new Date(baseMs + index * 1000).toISOString(),
      customer_note: `synthetic order ${index + 1} for the UI responsiveness recorder`,
      line_items: Array.from({ length: 3 }, (_, line) => ({
        id: index * 3 + line + 1,
        name: `Line item ${line + 1}`,
        quantity: line + 1,
        subtotal: `${(line + 1) * 5}.00`,
      })),
    },
  }));
}

export async function runBulkUpsertWorkload(input: {
  collection: BulkUpsertCollection;
  docCount?: number;
  runStamp?: string;
}): Promise<{ docsWritten: number }> {
  const docCount = input.docCount ?? BULK_UPSERT_DEFAULT_DOC_COUNT;
  const docs = generateResponsivenessOrderDocs(docCount, input.runStamp ?? 'static');
  assertBulkSuccess(await input.collection.bulkUpsert(docs), 'bulk-upsert workload');
  return { docsWritten: docs.length };
}

// ---------------------------------------------------------------------------
// Workload 3: pull-sync (real engine work — network + local writes)
// ---------------------------------------------------------------------------

export type ResponsivenessFetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

const PULL_SYNC_DEFAULT_LIMIT = 200;
const PULL_SYNC_DEFAULT_MAX_BATCHES = 5;

export async function runPullSyncWorkload(input: {
  baseUrl: string;
  repository: CustomPullRepository;
  limit?: number;
  maxBatches?: number;
  /** The transport port — required; see `pullCustomBatch`. */
  fetcher: ResponsivenessFetcher;
}): Promise<{ batches: number; documents: number; hasMore: boolean }> {
  const limit = input.limit ?? PULL_SYNC_DEFAULT_LIMIT;
  const maxBatches = input.maxBatches ?? PULL_SYNC_DEFAULT_MAX_BATCHES;

  let checkpoint: SyncCheckpoint | null = null;
  let batches = 0;
  let documents = 0;
  let hasMore = true;

  while (hasMore && batches < maxBatches) {
    const result = await syncCustomPullBatchIntoRepository({
      baseUrl: input.baseUrl,
      limit,
      repository: input.repository,
      checkpoint,
      fetcher: input.fetcher,
    });
    batches += 1;
    documents += result.documents;
    hasMore = result.hasMore;
    checkpoint = result.checkpoint;
  }

  return { batches, documents, hasMore };
}

// ---------------------------------------------------------------------------
// Suite: backend x workload cells (host-injected collection seam)
// ---------------------------------------------------------------------------

export type ResponsivenessWorkloadName = 'audit-diff' | 'bulk-upsert' | 'pull-sync';

export const RESPONSIVENESS_WORKLOADS: readonly ResponsivenessWorkloadName[] = ['audit-diff', 'bulk-upsert', 'pull-sync'];

export type ResponsivenessCell = {
  workload: ResponsivenessWorkloadName;
  metrics: ResponsivenessMetrics;
  workMs: number;
  detail: string;
};

export type ResponsivenessResult = {
  backend: string;
  cells: ResponsivenessCell[];
};

export type ResponsivenessSuiteParams = {
  auditDocCount?: number;
  auditPasses?: number;
  upsertDocCount?: number;
  pullLimit?: number;
  pullMaxBatches?: number;
  syncBaseUrl?: string;
};

/**
 * What a host hands the suite for one backend run: a bulk-upsert-capable
 * collection, a pull repository over it, and a teardown that disposes the
 * backing database. sync-core stays free of rxdb runtime imports — hosts own
 * createRxDatabase/addCollections (web: storageBackend factory + ajv wrapper;
 * electron: scopeDb-style creation + ajv wrapper).
 */
export type ResponsivenessCollectionHandle = {
  collection: BulkUpsertCollection;
  repository: CustomPullRepository;
  teardown(): Promise<void>;
};

export type ResponsivenessSuiteDeps = {
  /** REQUIRED host seam — fresh collection per suite run; teardown runs in a finally. */
  createCollection: (backendName: string) => Promise<ResponsivenessCollectionHandle>;
  /** The transport port — required when the suite includes the pull-sync workload (never defaulted to the global `fetch`). */
  fetcher?: ResponsivenessFetcher;
  now?: () => number;
  runStamp?: string;
  samplerDeps?: ResponsivenessSamplerDeps;
};

/**
 * Order-document schema for the responsiveness collection — plain JSON, no
 * rxdb types; hosts pass it to addCollections. Shared so web and electron
 * measure writes against the identical document shape.
 */
export const RESPONSIVENESS_ORDER_SCHEMA = {
  title: 'ui responsiveness order schema',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    payload: { type: 'object', additionalProperties: true },
  },
  required: ['id', 'payload'],
} as const;

/** Adapts a bulk-upsert collection into the CustomPullRepository the pull-sync workload needs. */
export function responsivenessRepositoryFor(collection: BulkUpsertCollection): CustomPullRepository {
  return {
    async upsertMany(documents) {
      assertBulkSuccess(await collection.bulkUpsert(documents.map((document) => ({ id: document.id, payload: document.payload }))), 'pull-sync workload');
    },
  };
}

/** Short unique stamp for doc ids and host database names (RxDB forbids duplicate open names). */
export function defaultResponsivenessRunStamp(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 46_656).toString(36)}`;
}

export async function runResponsivenessSuite(input: {
  backendName: string;
  workloads?: readonly ResponsivenessWorkloadName[];
  params?: ResponsivenessSuiteParams;
  deps: ResponsivenessSuiteDeps;
}): Promise<ResponsivenessResult> {
  const workloads = input.workloads ?? RESPONSIVENESS_WORKLOADS;
  const params = input.params ?? {};
  const deps = input.deps;
  const now = deps.now ?? (() => performance.now());
  const runStamp = deps.runStamp ?? defaultResponsivenessRunStamp();

  if (workloads.includes('pull-sync') && !params.syncBaseUrl) {
    throw new Error('pull-sync workload requires params.syncBaseUrl');
  }
  if (workloads.includes('pull-sync') && !deps.fetcher) {
    throw new Error('pull-sync workload requires deps.fetcher — the transport port is never defaulted to the global fetch');
  }

  // Hidden pages starve requestIdleCallback, which hangs the host's RxDB
  // database creation — install the polyfill before asking for a collection.
  if (typeof document !== 'undefined') {
    installHiddenPageIdlePolyfill();
  }

  const handle = await deps.createCollection(input.backendName);
  try {
    const cells: ResponsivenessCell[] = [];
    for (const workload of workloads) {
      const sampler = startResponsivenessSampler(deps.samplerDeps);
      const startedAt = now();
      let detail: string;
      try {
        if (workload === 'audit-diff') {
          const result = await runAuditDiffWorkload({
            ...(params.auditDocCount !== undefined ? { docCount: params.auditDocCount } : {}),
            ...(params.auditPasses !== undefined ? { passes: params.auditPasses } : {}),
          });
          detail = `docsProcessed=${result.docsProcessed} unchanged=${result.buckets.unchanged} stale=${result.buckets.stale} missingLocal=${result.buckets.missingLocal} localOnly=${result.buckets.localOnly}`;
        } else if (workload === 'bulk-upsert') {
          const result = await runBulkUpsertWorkload({
            collection: handle.collection,
            runStamp,
            ...(params.upsertDocCount !== undefined ? { docCount: params.upsertDocCount } : {}),
          });
          detail = `docsWritten=${result.docsWritten}`;
        } else {
          const result = await runPullSyncWorkload({
            baseUrl: params.syncBaseUrl as string,
            repository: handle.repository,
            ...(params.pullLimit !== undefined ? { limit: params.pullLimit } : {}),
            ...(params.pullMaxBatches !== undefined ? { maxBatches: params.pullMaxBatches } : {}),
            fetcher: deps.fetcher!, // guarded above: pull-sync requires deps.fetcher
          });
          detail = `batches=${result.batches} documents=${result.documents} hasMore=${result.hasMore}`;
        }
      } catch (error) {
        detail = `failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      const workMs = now() - startedAt;
      const metrics = sampler.stop();
      cells.push({ workload, metrics, workMs, detail });
    }

    return { backend: input.backendName, cells };
  } finally {
    await handle.teardown();
  }
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function formatMs(value: number): string {
  return `${Math.round(value)}ms`;
}

export function renderResponsivenessMarkdown(results: ResponsivenessResult[]): string {
  const workloads: string[] = [];
  for (const result of results) {
    for (const cell of result.cells) {
      if (!workloads.includes(cell.workload)) {
        workloads.push(cell.workload);
      }
    }
  }

  const header = `| backend | ${workloads.join(' | ')} |`;
  const separator = `| --- | ${workloads.map(() => '---').join(' | ')} |`;
  const rows = results.map((result) => {
    const columns = workloads.map((workload) => {
      const cell = result.cells.find((candidate) => candidate.workload === workload);
      if (!cell) {
        return '—';
      }
      // Frame-gap fields are meaningless from a hidden page (rAF starved);
      // only fold them into the blocking figure when the page was visible.
      const maxBlockMs = cell.metrics.pageVisible === false
        ? cell.metrics.longTaskMaxMs
        : Math.max(cell.metrics.longTaskMaxMs, cell.metrics.frameGapMaxMs);
      return `maxBlock ${formatMs(maxBlockMs)} / total ${formatMs(cell.metrics.longTaskTotalMs)} / ${cell.metrics.longTaskCount} longtasks`;
    });
    return `| ${result.backend} | ${columns.join(' | ')} |`;
  });

  return [header, separator, ...rows].join('\n');
}
