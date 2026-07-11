import { describe, expect, it } from 'vitest';
import type { OrderDocument, PullResponse } from '@woo-rxdb-lab/shared';
import type { ResponsivenessMetrics } from '../responsiveness';
import {
  buildAuditDiffFixture,
  generateResponsivenessOrderDocs,
  renderResponsivenessMarkdown,
  responsivenessRepositoryFor,
  runAuditDiffWorkload,
  runResponsivenessSuite,
  type BulkUpsertCollection,
  type ResponsivenessCell,
  type ResponsivenessCollectionHandle,
  type UiResponsivenessOrderDoc,
} from './responsivenessBench';

describe('runAuditDiffWorkload', () => {
  it('is deterministic for the same params and reports docsProcessed across passes', async () => {
    const first = await runAuditDiffWorkload({ docCount: 500, passes: 3, seed: 7 });
    const second = await runAuditDiffWorkload({ docCount: 500, passes: 3, seed: 7 });
    expect(second).toEqual(first);
    expect(first.docsProcessed).toBe(1_500);

    const fixture = buildAuditDiffFixture(500, 7);
    expect(fixture.serverEntries).toHaveLength(500);
    expect(first.buckets.unchanged + first.buckets.stale + first.buckets.localOnly).toBe(fixture.localDocs.length);
    expect(first.buckets.unchanged + first.buckets.stale + first.buckets.missingLocal).toBe(500);
    expect(first.buckets.stale).toBeGreaterThan(0);
    expect(first.buckets.missingLocal).toBeGreaterThan(0);
    expect(first.buckets.localOnly).toBe(3);
  });

  it('varies the fixture by seed but keeps each seed stable', () => {
    const seedOne = buildAuditDiffFixture(200, 1);
    const seedOneAgain = buildAuditDiffFixture(200, 1);
    const seedTwo = buildAuditDiffFixture(200, 2);
    expect(seedOneAgain).toEqual(seedOne);
    expect(JSON.stringify(seedTwo.localDocs)).not.toBe(JSON.stringify(seedOne.localDocs));
  });
});

describe('renderResponsivenessMarkdown', () => {
  const metrics = (overrides: Partial<ResponsivenessMetrics> = {}): ResponsivenessMetrics => ({
    longTaskCount: 0,
    longTaskTotalMs: 0,
    longTaskMaxMs: 0,
    pageVisible: true,
    frameGapCount: 0,
    frameGapMaxMs: 0,
    sampledMs: 100,
    ...overrides,
  });

  it('renders a backend x workload table with maxBlock/total/longtasks cells', () => {
    const auditCell: ResponsivenessCell = {
      workload: 'audit-diff',
      metrics: metrics({ longTaskCount: 2, longTaskTotalMs: 200.4, longTaskMaxMs: 120.2, frameGapMaxMs: 90 }),
      workMs: 250,
      detail: 'docsProcessed=200000',
    };
    const upsertCell: ResponsivenessCell = {
      workload: 'bulk-upsert',
      metrics: metrics({ frameGapCount: 1, frameGapMaxMs: 75 }),
      workMs: 80,
      detail: 'docsWritten=2000',
    };

    const markdown = renderResponsivenessMarkdown([
      { backend: 'dexie', cells: [auditCell, upsertCell] },
      { backend: 'memory', cells: [auditCell] },
    ]);

    const lines = markdown.split('\n');
    expect(lines[0]).toBe('| backend | audit-diff | bulk-upsert |');
    expect(lines[1]).toBe('| --- | --- | --- |');
    expect(lines[2]).toContain('| dexie | maxBlock 120ms / total 200ms / 2 longtasks');
    expect(lines[2]).toContain('| maxBlock 75ms / total 0ms / 0 longtasks |');
    expect(lines[3]).toContain('| memory | maxBlock 120ms / total 200ms / 2 longtasks | — |');
  });

  it('renders an empty table when no results exist', () => {
    expect(renderResponsivenessMarkdown([])).toBe('| backend |  |\n| --- |  |');
  });
});

describe('hidden-page blocking summary', () => {
  it('excludes frame gaps from maxBlock when the page was hidden', () => {
    const markdown = renderResponsivenessMarkdown([
      {
        backend: 'dexie',
        cells: [{
          workload: 'audit-diff',
          workMs: 100,
          detail: '',
          metrics: {
            longTaskCount: 1,
            longTaskTotalMs: 80,
            longTaskMaxMs: 80,
            frameGapCount: 1,
            frameGapMaxMs: 5000, // rAF-starved artifact, must not surface
            sampledMs: 100,
            pageVisible: false,
          },
        }],
      },
    ]);
    expect(markdown).toContain('80');
    expect(markdown).not.toContain('5000');
  });
});

describe('runResponsivenessSuite (host-injected collection seam)', () => {
  function orderDocument(orderId: number): OrderDocument {
    return {
      id: `woo-order:${orderId}`,
      wooOrderId: orderId,
      payload: { id: orderId, date_modified_gmt: '2026-01-01T00:00:00.000Z' },
      sync: {
        revision: `r${orderId}`,
        checkpoint: { updatedAtGmt: '2026-01-01T00:00:00.000Z', orderId, revision: `r${orderId}`, sequence: orderId },
        partial: false,
        source: 'custom-pull',
      },
      local: { dirty: false, pendingMutationIds: [] },
    };
  }

  /** Fake host seam — a Map-backed collection, no rxdb anywhere near sync-core. */
  function createFakeCollectionHandle() {
    const stored = new Map<string, UiResponsivenessOrderDoc>();
    const state = { createdFor: [] as string[], tornDown: 0, upsertedIds: [] as string[] };
    const collection: BulkUpsertCollection = {
      async bulkUpsert(docs) {
        for (const doc of docs) {
          stored.set(doc.id, doc);
          state.upsertedIds.push(doc.id);
        }
        return { success: [...docs], error: [] };
      },
    };
    const createCollection = async (backendName: string): Promise<ResponsivenessCollectionHandle> => {
      state.createdFor.push(backendName);
      return {
        collection,
        repository: responsivenessRepositoryFor(collection),
        teardown: async () => {
          state.tornDown += 1;
          stored.clear();
        },
      };
    };
    return { createCollection, stored, state };
  }

  it('runs all workloads against the injected collection and reports a cell per workload', async () => {
    const fetchedUrls: string[] = [];
    const responses: PullResponse[] = [
      {
        documents: [orderDocument(1), orderDocument(2)],
        checkpoint: { updatedAtGmt: '2026-01-01T00:00:02.000Z', orderId: 2, revision: 'r2', sequence: 2 },
        hasMore: true,
      },
      {
        documents: [orderDocument(3)],
        checkpoint: { updatedAtGmt: '2026-01-01T00:00:03.000Z', orderId: 3, revision: 'r3', sequence: 3 },
        hasMore: false,
      },
    ];
    const fetcher = async (url: string): Promise<Response> => {
      fetchedUrls.push(url);
      const body = responses[Math.min(fetchedUrls.length - 1, responses.length - 1)];
      return new Response(JSON.stringify(body), { status: 200 });
    };

    const fake = createFakeCollectionHandle();
    const result = await runResponsivenessSuite({
      backendName: 'fake-backend',
      params: {
        auditDocCount: 200,
        auditPasses: 2,
        upsertDocCount: 25,
        pullLimit: 10,
        pullMaxBatches: 5,
        syncBaseUrl: 'http://test.local/sync',
      },
      deps: {
        createCollection: fake.createCollection,
        fetcher,
        runStamp: 'corestamp',
      },
    });

    expect(result.backend).toBe('fake-backend');
    expect(fake.state.createdFor).toEqual(['fake-backend']);
    expect(result.cells.map((cell) => cell.workload)).toEqual(['audit-diff', 'bulk-upsert', 'pull-sync']);
    expect(result.cells[0].detail).toContain('docsProcessed=400');
    expect(result.cells[1].detail).toBe('docsWritten=25');
    expect(result.cells[2].detail).toBe('batches=2 documents=3 hasMore=false');
    expect(fetchedUrls).toHaveLength(2);
    expect(fetchedUrls[1]).toContain('order_id=2');
    expect(fake.state.tornDown).toBe(1);
    for (const cell of result.cells) {
      expect(cell.workMs).toBeGreaterThanOrEqual(0);
      expect(cell.metrics.sampledMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('threads the runStamp into bulk-upsert document ids (host doc-id determinism)', async () => {
    const fake = createFakeCollectionHandle();
    await runResponsivenessSuite({
      backendName: 'fake-backend',
      workloads: ['bulk-upsert'],
      params: { upsertDocCount: 3 },
      deps: { createCollection: fake.createCollection, runStamp: 'stampx' },
    });
    const expected = generateResponsivenessOrderDocs(3, 'stampx').map((doc) => doc.id);
    expect(fake.state.upsertedIds).toEqual(expected);
    expect(expected).toEqual(['ui-resp-order:stampx:1', 'ui-resp-order:stampx:2', 'ui-resp-order:stampx:3']);
  });

  it('captures a workload failure in the cell detail and still tears down', async () => {
    const failing: BulkUpsertCollection = {
      async bulkUpsert(docs) {
        return { success: [], error: [...docs] };
      },
    };
    const state = { tornDown: 0 };
    const result = await runResponsivenessSuite({
      backendName: 'fake-backend',
      workloads: ['bulk-upsert'],
      params: { upsertDocCount: 2 },
      deps: {
        createCollection: async () => ({
          collection: failing,
          repository: responsivenessRepositoryFor(failing),
          teardown: async () => {
            state.tornDown += 1;
          },
        }),
      },
    });
    expect(result.cells[0].detail).toContain('failed: bulk-upsert workload failed');
    expect(state.tornDown).toBe(1);
  });

  it('rejects pull-sync runs without a sync base URL before creating a collection', async () => {
    const fake = createFakeCollectionHandle();
    await expect(runResponsivenessSuite({
      backendName: 'fake-backend',
      workloads: ['pull-sync'],
      deps: { createCollection: fake.createCollection },
    })).rejects.toThrow('pull-sync workload requires params.syncBaseUrl');
    expect(fake.state.createdFor).toEqual([]);
  });
});

describe('responsivenessRepositoryFor', () => {
  it('maps pulled documents onto the collection and surfaces write errors', async () => {
    const seen: UiResponsivenessOrderDoc[][] = [];
    const repository = responsivenessRepositoryFor({
      async bulkUpsert(docs) {
        seen.push(docs);
        return { success: [...docs], error: [] };
      },
    });
    await repository.upsertMany([
      { id: 'a', wooOrderId: 1, payload: { id: 1 }, sync: { revision: 'r', checkpoint: { updatedAtGmt: '', orderId: 1, revision: 'r', sequence: 1 }, partial: false, source: 'custom-pull' }, local: { dirty: false, pendingMutationIds: [] } },
    ]);
    expect(seen).toEqual([[{ id: 'a', payload: { id: 1 } }]]);

    const failing = responsivenessRepositoryFor({
      async bulkUpsert(docs) {
        return { success: [], error: [...docs] };
      },
    });
    await expect(failing.upsertMany([
      { id: 'b', wooOrderId: 2, payload: { id: 2 }, sync: { revision: 'r', checkpoint: { updatedAtGmt: '', orderId: 2, revision: 'r', sequence: 2 }, partial: false, source: 'custom-pull' }, local: { dirty: false, pendingMutationIds: [] } },
    ])).rejects.toThrow('pull-sync workload failed');
  });
});
