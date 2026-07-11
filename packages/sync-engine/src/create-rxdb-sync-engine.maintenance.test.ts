/**
 * Slice 5d: the four maintenance lanes driven ENTIRELY through the public
 * handle (mode:'manual' + sync(lane)) against /testing adapters — the web
 * host's mountWebSyncHost lanes 4–7, now engine verbs.
 */

import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { createRxdbSyncEngine, type RxdbSyncEngine, type RxdbSyncEnginePorts, type StoreScopeIdentity, type EngineEvent } from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

setPremiumFlag();

const SITE = 'https://lab.example.test';
let uniqueStore = 0;

function freshIdentity(): StoreScopeIdentity {
  uniqueStore += 1;
  return { site: SITE, storeId: 5, cashierId: `maint-${uniqueStore}` };
}

function engineWith(overrides?: Partial<RxdbSyncEnginePorts>, identity = freshIdentity()): RxdbSyncEngine {
  return createRxdbSyncEngine({
    site: { syncBaseUrl: `${SITE}/wp-json/wc-rxdb-sync/v1`, wpJsonRoot: `${SITE}/wp-json` },
    storage: memoryEngineStorage(),
    mode: 'manual',
    ...overrides,
  }, identity);
}

async function taskRows(engine: RxdbSyncEngine): Promise<Array<Record<string, unknown>>> {
  const scope = engine.active();
  if (!scope) throw new Error('no active scope');
  const docs = await (scope.database.collections.schedulerTaskStates as { find(): { exec(): Promise<Array<{ toJSON(): Record<string, unknown> }>> } }).find().exec();
  return docs.map((doc) => doc.toJSON());
}

describe('maintenance lanes through the public handle (slice 5d)', () => {
  it('seeds the POS bootstrap lanes once for each opened scope without reseeding a returning scope', async () => {
    const initialIdentity = freshIdentity();
    const engine = engineWith(undefined, initialIdentity);
    await engine.ready;

    const initialRows = await taskRows(engine);
    expect(initialRows.map((row) => row['collectionName']).sort()).toEqual([
      'brands',
      'categories',
      'coupons',
      'tags',
      'taxRates',
    ]);

    const initialScope = engine.active();
    if (!initialScope) throw new Error('no active scope');
    const initialTaskDocuments = await (initialScope.database.collections.schedulerTaskStates as {
      find(): { exec(): Promise<Array<{ incrementalPatch(patch: Record<string, unknown>): Promise<unknown> }>> };
    }).find().exec();
    await Promise.all(initialTaskDocuments.map((document) => document.incrementalPatch({ status: 'completed' })));
    expect((await taskRows(engine)).every((row) => row['status'] === 'completed')).toBe(true);

    await engine.scope.switch(freshIdentity());
    const switchedRows = await taskRows(engine);
    expect(switchedRows.map((row) => row['collectionName']).sort()).toEqual([
      'brands',
      'categories',
      'coupons',
      'tags',
      'taxRates',
    ]);

    await engine.scope.switch(initialIdentity);
    const returnedRows = await taskRows(engine);
    expect(returnedRows).toHaveLength(initialRows.length);
    expect(returnedRows.every((row) => row['status'] === 'completed')).toBe(true);
    await engine.dispose();
  });

  it('order-window-seed persists the windowed open-recent task into the scope database', async () => {
    const engine = engineWith();
    await engine.ready;
    const report = await engine.sync('order-window-seed');
    expect(report.status).toBe('ran');

    const rows = await taskRows(engine);
    const windowed = rows.find((row) => row['collectionName'] === 'orders' && row['mode'] === 'windowed');
    expect(windowed).toBeDefined();
    expect(windowed!['priority']).toBe(600);
    expect(String(windowed!['queryKey'])).toContain('pending,processing,on-hold');
    await engine.dispose();
  });

  it('reference-seed persists all four greedy reference lanes', async () => {
    const engine = engineWith();
    await engine.ready;
    const report = await engine.sync('reference-seed');
    expect(report.status).toBe('ran');

    const rows = await taskRows(engine);
    const greedy = rows
      .filter((row) => row['mode'] === 'greedy' && row['collectionName'] !== 'taxRates')
      .map((row) => row['collectionName'])
      .sort();
    expect(greedy).toEqual(['brands', 'categories', 'coupons', 'tags']);
    await engine.dispose();
  });

  it('query-total-retry reports skipped without the port, and drains + emits cache entries with it', async () => {
    const bare = engineWith();
    await bare.ready;
    const skipped = await bare.sync('query-total-retry');
    expect(skipped.status).toBe('skipped');
    expect(skipped.reason).toContain('queryTotal');
    await bare.dispose();

    // With the port: seed a due request state directly (the persisted shape the
    // web app writes), then one lane tick claims + fetches + caches it.
    const fetchWooQueryTotal = vi.fn(async () => 42);
    const engine = engineWith({ queryTotal: { fetchWooQueryTotal }, now: () => 1_000_000 });
    await engine.ready;
    const scope = engine.active();
    if (!scope) throw new Error('no active scope');
    await (scope.database.collections.queryTotalRequestStates as { insert(doc: Record<string, unknown>): Promise<unknown> }).insert({
      queryKey: 'orders:total:test',
      status: 'failed',
      ownerId: null,
      claimedUntilMs: null,
      attempt: 0,
      retryAfterMs: 0, // due immediately
      updatedAtMs: 0,
      request: { queryKey: 'orders:total:test', method: 'GET', endpoint: '/orders', params: {}, totalHeader: 'X-WP-Total' },
      schemaVersion: 2,
    });
    const events: EngineEvent[] = [];
    engine.events((event) => events.push(event));

    const report = await engine.sync('query-total-retry');
    expect(report.status).toBe('ran');
    expect(fetchWooQueryTotal).toHaveBeenCalledTimes(1);
    const cacheEvent = events.find((event) => event.type === 'query-total-cache');
    expect(cacheEvent).toBeDefined();
    await engine.dispose();
  });

  it('dispose waits for an in-flight maintenance write before closing the scope database', async () => {
    let releaseFetch!: (total: number) => void;
    const fetchWooQueryTotal = vi.fn(() => new Promise<number>((resolve) => {
      releaseFetch = resolve;
    }));
    const engine = engineWith({ queryTotal: { fetchWooQueryTotal }, now: () => 1_000_000 });
    await engine.ready;
    const scope = engine.active();
    if (!scope) throw new Error('no active scope');
    const close = vi.spyOn(scope.database, 'close');
    await (scope.database.collections.queryTotalRequestStates as { insert(doc: Record<string, unknown>): Promise<unknown> }).insert({
      queryKey: 'orders:total:guarded-dispose',
      status: 'failed',
      ownerId: null,
      claimedUntilMs: null,
      attempt: 0,
      retryAfterMs: 0,
      updatedAtMs: 0,
      request: { queryKey: 'orders:total:guarded-dispose', method: 'GET', endpoint: '/orders', params: {}, totalHeader: 'X-WP-Total' },
      schemaVersion: 2,
    });

    const tick = engine.sync('query-total-retry');
    await vi.waitFor(() => expect(fetchWooQueryTotal).toHaveBeenCalledTimes(1));
    const disposing = engine.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const closeStartedBeforeTickFinished = close.mock.calls.length > 0;

    releaseFetch(42);
    const report = await tick;
    await disposing;
    expect(closeStartedBeforeTickFinished).toBe(false);
    expect(report.status).toBe('ran');
  });

  it('auto mode retries a persisted due query-total request immediately after ready', async () => {
    const storage = memoryEngineStorage();
    const identity = freshIdentity();
    const seed = engineWith({ storage }, identity);
    await seed.ready;
    const scope = seed.active();
    if (!scope) throw new Error('no active scope');
    await (scope.database.collections.queryTotalRequestStates as { insert(doc: Record<string, unknown>): Promise<unknown> }).insert({
      queryKey: 'orders:total:auto-start',
      status: 'failed',
      ownerId: null,
      claimedUntilMs: null,
      attempt: 0,
      retryAfterMs: 0,
      updatedAtMs: 0,
      request: { queryKey: 'orders:total:auto-start', method: 'GET', endpoint: '/orders', params: {}, totalHeader: 'X-WP-Total' },
      schemaVersion: 2,
    });
    await seed.dispose();

    const fetchWooQueryTotal = vi.fn(async () => 42);
    const engine = engineWith({
      storage,
      mode: 'auto',
      queryTotal: { fetchWooQueryTotal },
      now: () => 1_000_000,
      intervals: { queryTotalRetryScanMs: 60_000 },
    }, identity);
    await engine.ready;
    await vi.waitFor(() => expect(fetchWooQueryTotal).toHaveBeenCalledTimes(1), { timeout: 1_000 });
    await engine.dispose();
  });

  it('opens a manual read-only engine without Web Crypto', async () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const engine = engineWith();
      await engine.ready;
      expect(engine.active()).not.toBeNull();
      await engine.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('coverage-compaction runs clean on an empty coverage store and records no error', async () => {
    const engine = engineWith({ now: () => 10_000_000 });
    await engine.ready;
    const report = await engine.sync('coverage-compaction');
    expect(report.status).toBe('ran');
    expect(engine.status().lanes['coverage-compaction']).toMatchObject({ lastError: null, lastTick: { status: 'ran' } });
    await engine.dispose();
  });

  it('exposes existence prime and reconcile only through the public facade and coverage diagnostics', async () => {
    const diagnostics = vi.fn();
    const engine = engineWith({ diagnostics });
    await engine.ready;

    await expect(engine.sync('existence-prime')).resolves.toMatchObject({ lane: 'existence-prime', status: 'ran' });
    await expect(engine.sync('existence-reconcile')).resolves.toMatchObject({ lane: 'existence-reconcile', status: 'ran' });
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ type: 'coverage.existence-prime' }));
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ type: 'coverage.existence-reconcile' }));
    expect(engine.status().lanes['existence-prime']).toMatchObject({ lastError: null, lastTick: { status: 'ran' } });
    expect(engine.status().lanes['existence-reconcile']).toMatchObject({ lastError: null, lastTick: { status: 'ran' } });
    await engine.dispose();
  });

  it('maintenance lanes skip while offline', async () => {
    const engine = engineWith({ connectivity: () => 'offline' });
    await engine.ready;
    for (const lane of ['order-window-seed', 'reference-seed', 'coverage-compaction', 'existence-prime', 'existence-reconcile'] as const) {
      const report = await engine.sync(lane);
      expect(report.status, lane).toBe('skipped');
      expect(report.reason, lane).toBe('offline');
    }
    await engine.dispose();
  });
});
