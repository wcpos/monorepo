// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createLocalCoverage, type CreateLocalCoverageOptions, type LocalCoverage } from './local-coverage';
import type { CoverageDatabase } from './persistence';
import type { CoverageCompactionFailureDatabase } from './rx-coverage-compaction-failure-repository';
import type { CoverageCompactionLeaseDatabase } from './rx-coverage-compaction-lease-repository';

type Stored = Record<string, unknown> & { _deleted?: boolean };

function memoryCollection(key: string, options: { conflictOnce?: boolean } = {}) {
  const documents = new Map<string, Stored>();
  let conflictOnce = options.conflictOnce ?? false;
  const wrapped = (id: string, value: Stored) => ({
    ...value,
    toJSON: () => documents.get(id) ?? value,
    incrementalModify: async (modify: (current: Stored) => Stored) => {
      const next = modify(documents.get(id) ?? value);
      if (next._deleted) documents.delete(id); else documents.set(id, next);
      return next;
    },
  });
  return {
    documents,
    bulkUpsert: vi.fn(async (items: Stored[]) => items.forEach((item) => documents.set(String(item[key]), item))),
    insert: vi.fn(async (item: Stored) => {
      const id = String(item[key]);
      if (conflictOnce) {
        conflictOnce = false;
        documents.set(id, { ...item, coveredQueryKeys: ['orders:concurrent'], freshUntilMs: 9_000, updatedAtMs: 2_000 });
        throw Object.assign(new Error('conflict'), { code: 'CONFLICT' });
      }
      documents.set(id, item);
      return wrapped(id, item);
    }),
    find: vi.fn(() => ({ exec: async () => [...documents].map(([id, value]) => wrapped(id, value)) })),
    findOne: vi.fn((id: string) => ({ exec: async () => {
      const value = documents.get(id);
      return value ? wrapped(id, value) : null;
    } })),
  };
}

function coverageDatabase(options: { recordConflictOnce?: boolean } = {}) {
  return {
    coverageRecords: memoryCollection('coverageKey', { conflictOnce: options.recordConflictOnce }),
    coverageLanes: memoryCollection('laneKey'),
  };
}

describe('LocalCoverage interface', () => {
  it('requires compaction stores and all manifest stores when manifest priming is enabled', () => {
    const coverageOnlyDatabase = coverageDatabase() as unknown as CoverageDatabase;
    // @ts-expect-error compaction maintenance is always exposed, so its stores are required.
    const missingCompactionStores: CreateLocalCoverageOptions = { database: coverageOnlyDatabase, freshForMs: 1 };
    const compactionDatabase = coverageOnlyDatabase as CoverageDatabase & CoverageCompactionLeaseDatabase & CoverageCompactionFailureDatabase;
    // @ts-expect-error enabling manifest priming requires every manifest collection.
    const missingManifestStores: CreateLocalCoverageOptions = {
      database: compactionDatabase,
      freshForMs: 1,
      manifest: { fetcher: vi.fn(), syncBaseUrl: 'https://example.test/sync' },
    };

    expect([missingCompactionStores, missingManifestStores]).toHaveLength(2);
  });

  it('constructs one coverage home without exposing persistence policy on operations', async () => {
    const database = coverageDatabase();
    const coverage: LocalCoverage = createLocalCoverage({
      database: database as never,
      now: () => 1_000,
      freshForMs: 500,
    });

    await coverage.recordQueryResult({
      collection: 'orders',
      queryKey: 'orders:open',
      records: [{ id: 'woo-order:1' }],
      complete: true,
    });

    await expect(coverage.readRecord('orders', 'woo-order:1')).resolves.toEqual({
      collection: 'orders', id: 'woo-order:1', fresh: true,
    });
    await expect(coverage.readLane('orders', 'orders:open')).resolves.toEqual({
      collection: 'orders', queryKey: 'orders:open', complete: true, fresh: true, expectedRecordIds: ['woo-order:1'],
    });
  });

  it('lets an explicit marker-precedence timestamp beat a complete marker under a fixed clock', async () => {
    const coverage = createLocalCoverage({
      database: coverageDatabase() as never,
      now: () => 1_000,
      freshForMs: 500,
    });

    await coverage.recordQueryResult({
      collection: 'orders',
      queryKey: 'orders:baseline-in-progress',
      records: [],
      complete: true,
    });
    await coverage.recordQueryResult({
      collection: 'orders',
      queryKey: 'orders:baseline-in-progress',
      records: [],
      complete: false,
      nowMs: 1_001,
      freshForMs: 0,
    });

    await expect(coverage.readLane('orders', 'orders:baseline-in-progress')).resolves.toEqual(expect.objectContaining({
      complete: false,
    }));
  });

  it('retains the newest concurrent record winner and merges both query memberships after an insert CAS conflict', async () => {
    const database = coverageDatabase({ recordConflictOnce: true });
    const times = [1_000, 3_000];
    const coverage = createLocalCoverage({ database: database as never, now: () => times.shift() ?? 3_000, freshForMs: 500 });

    await Promise.all([
      coverage.recordQueryResult({ collection: 'orders', queryKey: 'orders:query', records: [{ id: 'order-1' }], complete: true }),
      coverage.recordRecords({ collection: 'orders', queryKey: 'orders:requested', records: [{ id: 'order-1' }] }),
    ]);

    expect(database.coverageRecords.documents.get('orders::order-1')).toMatchObject({
      coveredQueryKeys: ['orders:requested', 'orders:query'],
      freshUntilMs: 3_500,
      updatedAtMs: 3_000,
    });
  });

  it('primes manifests in pages and filters invalid, stray, existing, and local-only ids through the facade', async () => {
    const database = coverageDatabase() as ReturnType<typeof coverageDatabase> & Record<string, unknown>;
    const manifest = memoryCollection('id');
    manifest.documents.set('2', { id: '2', wooId: 2, objectType: 'product', digest: 'existing' });
    Object.assign(database, {
      existenceManifest: { ...manifest, count: () => ({ exec: async () => manifest.documents.size }) },
      existenceManifestCustomers: { ...memoryCollection('id'), count: () => ({ exec: async () => 0 }) },
      existenceManifestOrders: { ...memoryCollection('id'), count: () => ({ exec: async () => 0 }) },
      products: { count: () => ({ exec: async () => 4 }), find: () => ({ exec: async () => [{ wooProductId: 1 }, { wooProductId: 2 }, { wooProductId: null }, { wooProductId: -1 }] }) },
      variations: { count: () => ({ exec: async () => 2 }), find: () => ({ exec: async () => [{ wooId: 3 }, { wooId: 4 }] }) },
      customers: { count: () => ({ exec: async () => 0 }), find: () => ({ exec: async () => [] }) },
      orders: { count: () => ({ exec: async () => 0 }), find: () => ({ exec: async () => [] }) },
    });
    const fetcher = vi.fn(async (url: string) => {
      const ids = new URL(url).searchParams.get('include')?.split(',').map(Number) ?? [];
      return { ok: true, status: 200, json: async () => ({ digests: [...ids.map((id) => ({ id, digest: id === 4 ? '' : `digest-${id}` })), { id: 999, digest: 'stray' }] }) };
    });
    const coverage = createLocalCoverage({ database: database as never, freshForMs: 1, manifest: { fetcher, syncBaseUrl: 'https://example.test/sync', chunkSize: 2 } });

    await expect(coverage.primeManifest()).resolves.toEqual({ products: 2, customers: 0, orders: 0 });
    expect(fetcher.mock.calls.map(([url]) => new URL(url).searchParams.get('include'))).toEqual(['1,3', '4']);
    expect([...manifest.documents.values()].map(({ wooId, digest, objectType }) => ({ wooId, digest, objectType }))).toEqual([
      { wooId: 2, digest: 'existing', objectType: 'product' },
      { wooId: 1, digest: 'digest-1', objectType: 'product' },
      { wooId: 3, digest: 'digest-3', objectType: 'variation' },
    ]);
  });

  it('plans and dispatches a reconcile pass while keeping dirty stale records', async () => {
    const deleteProducts = vi.fn(async () => undefined);
    const pullProducts = vi.fn(async () => undefined);
    const coverage = createLocalCoverage({
      database: coverageDatabase() as never,
      freshForMs: 1,
      reconcile: {
        bucketSize: 100,
        maxWooId: async () => 30,
        readManifestRange: async () => [
          { id: '10', wooId: 10, objectType: 'product', digest: 'gone' },
          { id: '20', wooId: 20, objectType: 'product', digest: 'keep-dirty' },
        ],
        dirtyWooIds: async () => new Set([20]),
        fetchServerBucket: async () => [{ id: 30, objectType: 'product', digest: 'new' }],
        deleteProducts,
        deleteVariations: vi.fn(async () => undefined),
        pullProducts,
        pullVariations: vi.fn(async () => undefined),
      },
    });

    await expect(coverage.reconcilePass()).resolves.toEqual({ buckets: 1, pruned: 1, pulled: 1, repulled: 0, skippedDirty: 1 });
    expect(deleteProducts).toHaveBeenCalledWith([10]);
    expect(pullProducts).toHaveBeenCalledWith([30]);
  });

  it('waits for every id-space reconcile before reporting aggregated failures', async () => {
    let releaseSlow!: () => void;
    const slowGate = new Promise<void>((resolve) => { releaseSlow = resolve; });
    let slowCompleted = false;
    const port = (maxWooId: () => Promise<number>) => ({
      bucketSize: 100,
      maxWooId,
      readManifestRange: async () => [],
      dirtyWooIds: async () => new Set<number>(),
      fetchServerBucket: async () => [],
      deleteProducts: async () => undefined,
      deleteVariations: async () => undefined,
      pullProducts: async () => undefined,
      pullVariations: async () => undefined,
    });
    const coverage = createLocalCoverage({
      database: coverageDatabase() as never,
      freshForMs: 1,
      reconcile: [
        port(async () => { throw new Error('products failed fast'); }),
        port(async () => {
          await slowGate;
          slowCompleted = true;
          return 0;
        }),
      ],
    });

    const pass = coverage.reconcilePass();
    let settled = false;
    void pass.catch(() => undefined).then(() => { settled = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);
    releaseSlow();

    await expect(pass).rejects.toThrow(/products failed fast/);
    expect(slowCompleted).toBe(true);
  });

  it('keeps private LocalCoverage axes behind the facade outside tests', () => {
    const modules = (import.meta as ImportMeta & {
      glob: (pattern: string, options: Record<string, unknown>) => Record<string, string>;
    }).glob('./*.ts', { eager: true, query: '?raw', import: 'default' });
    const offenders = Object.entries(modules)
      .filter(([file]) => !file.endsWith('.test.ts'))
      .filter(([, source]) => /from ['"]\.\/(?:compaction|manifest|persistence|reconciliation)['"]/.test(source))
      .map(([file]) => file.slice(2));
    expect(offenders).toEqual(['local-coverage.ts']);
  });

  it('keeps issue #496 hooks on the interface without wiring either as a lane', () => {
    const coverage = createLocalCoverage({
      database: { coverageRecords: {}, coverageLanes: {} } as never,
      now: () => 0,
      freshForMs: 1,
    });

    expect(coverage.primeManifest).toEqual(expect.any(Function));
    expect(coverage.reconcilePass).toEqual(expect.any(Function));
  });
});
