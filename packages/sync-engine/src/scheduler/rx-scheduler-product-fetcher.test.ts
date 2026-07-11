// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ProductDocument } from '@woo-rxdb-lab/shared';
import { createProductsSchedulerFetcher, coverageRecordId } from './rx-scheduler-product-fetcher';
import type { FetchTask } from './replication-policy';

function productTask(overrides: Partial<FetchTask> = {}): FetchTask {
  return {
    id: 'products:search:keyboard:windowed',
    requirementId: 'products.search.keyboard',
    collection: 'products',
    queryKey: 'products:search:keyboard',
    limit: 25,
    priority: 900,
    mode: 'windowed',
    ...overrides,
  };
}

function response(payload: unknown[]): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
}

// Server-stamped identity: a deterministic v4-shaped uuid per Woo id, so the post-flip
// STORAGE key (document.id) is predictable. The numeric wooId survives as `wooProductId`
// and as the `woo-product:<id>` COVERAGE key (decoupled from storage — see #234).
const uuidFor = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const posMeta = (n: number) => [{ key: '_woocommerce_pos_uuid', value: uuidFor(n) }];

describe('createProductsSchedulerFetcher', () => {
  it('fetches product search tasks through Woo REST and stores full product documents', async () => {
    const repository = { upsertMany: vi.fn(async () => undefined) };
    const fetcher = vi.fn(async () => response([
      { id: 321, name: 'Keyboard', date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(321) },
    ]));
    const schedulerFetcher = createProductsSchedulerFetcher({
      baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
      repository,
      fetcher,
    });

    const result = await schedulerFetcher(productTask());

    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://wcpos.local/wp-json/wc-rxdb-sync/v1/products?search=keyboard&per_page=25&page=1&orderby=id&order=desc');
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://wcpos.local/wp-json/wc-rxdb-sync/v1/products?sku=keyboard&per_page=25&page=1&orderby=id&order=desc');
    expect(repository.upsertMany).toHaveBeenCalledWith([{
      id: uuidFor(321),
      wooProductId: 321,
      // Promoted filter/sort columns attached at the storage seam (withProductColumns). This payload
      // carries no filter fields, so they default — proving the promotion runs on every upsert.
      price: 0,
      stockStatus: '',
      type: '',
      categoryIds: [],
      brandIds: [],
      onSale: false,
      featured: false,
      stockQuantity: null,
      payload: { id: 321, name: 'Keyboard', date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(321) },
      sync: {
        revision: '2026-05-20T10:10:00',
        partial: false,
        source: 'woo-rest',
      },
      local: { dirty: false, pendingMutationIds: [] },
    }]);
    expect(result).toEqual({
      taskId: 'products:search:keyboard:windowed',
      documentCount: 1,
      requestCount: 2,
      completed: true,
    });
  });

  it('populates the Leg-3 manifest from _rxdb_digest and strips it from the stored payload', async () => {
    const repository = { upsertMany: vi.fn(async () => undefined) };
    const manifestSink = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => response([
      { id: 321, name: 'Keyboard', date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(321), _rxdb_digest: '9223372036854775810' },
    ]));
    const schedulerFetcher = createProductsSchedulerFetcher({
      baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
      repository,
      fetcher,
      manifestSink,
    });

    await schedulerFetcher(productTask());

    // The manifest receives the {wooId, digest} row (digest a string — un-truncated).
    expect(manifestSink).toHaveBeenCalledWith([{ id: '321', wooId: 321, objectType: 'product', digest: '9223372036854775810' }]);
    // The stored payload is stripped of _rxdb_digest (never persisted into the product doc).
    const calls = repository.upsertMany.mock.calls as unknown as Array<[Array<{ payload: Record<string, unknown> }>]>;
    const upserted = calls[0]?.[0]?.[0];
    expect(upserted).toBeDefined();
    expect('_rxdb_digest' in (upserted?.payload ?? {})).toBe(false);
    expect(upserted?.payload).toEqual({ id: 321, name: 'Keyboard', date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(321) });
  });

  it('merges exact SKU matches into product search task results', async () => {
    const repository = { upsertMany: vi.fn(async () => undefined) };
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('sku=KEY-101')) {
        return response([{ id: 101, sku: 'KEY-101', name: 'Keyboard Stand', date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(101) }]);
      }
      return response([]);
    });
    const schedulerFetcher = createProductsSchedulerFetcher({
      baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
      repository,
      fetcher,
    });

    const result = await schedulerFetcher(productTask({
      id: 'products:search:KEY-101:windowed',
      queryKey: 'products:search:KEY-101',
    }));

    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://wcpos.local/wp-json/wc-rxdb-sync/v1/products?search=KEY-101&per_page=25&page=1&orderby=id&order=desc');
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://wcpos.local/wp-json/wc-rxdb-sync/v1/products?sku=KEY-101&per_page=25&page=1&orderby=id&order=desc');
    expect(repository.upsertMany).toHaveBeenCalledWith([expect.objectContaining({ id: uuidFor(101), wooProductId: 101 })]);
    expect(result).toEqual({
      taskId: 'products:search:KEY-101:windowed',
      documentCount: 1,
      requestCount: 2,
      completed: true,
    });
  });

  it('preserves exact SKU matches when search results fill the task limit', async () => {
    const repository = { upsertMany: vi.fn(async () => undefined) };
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('sku=KEY-101')) {
        return response([{ id: 101, sku: 'KEY-101', name: 'Keyboard Stand', date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(101) }]);
      }
      return response([
        { id: 201, name: 'Keyboard A', date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(201) },
        { id: 202, name: 'Keyboard B', date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(202) },
      ]);
    });
    const schedulerFetcher = createProductsSchedulerFetcher({
      baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
      repository,
      fetcher,
    });

    await schedulerFetcher(productTask({
      id: 'products:search:KEY-101:windowed',
      queryKey: 'products:search:KEY-101',
      limit: 2,
    }));

    expect(repository.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: uuidFor(101), wooProductId: 101 }),
      expect.objectContaining({ id: uuidFor(201), wooProductId: 201 }),
    ]);
  });

  it('records incomplete product search coverage when the first page is full', async () => {
    const repository = { upsertMany: vi.fn(async () => undefined) };
    const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
    const products = Array.from({ length: 2 }, (_, index) => ({ id: index + 1, date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(index + 1) }));
    const fetcher = vi.fn(async () => response(products));
    const schedulerFetcher = createProductsSchedulerFetcher({
      baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
      repository,
      coverageRepository,
      coverageFreshForMs: 60_000,
      nowMs: () => 5_000,
      fetcher,
    });

    const result = await schedulerFetcher(productTask({ limit: 2 }));

    expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
      collection: 'products',
      queryKey: 'products:search:keyboard',
      records: [{ id: 'woo-product:1' }, { id: 'woo-product:2' }],
      complete: false,
      nowMs: 5_000,
      freshForMs: 60_000,
    });
    expect(result.completed).toBe(false);
  });

  it('passes raw percent signs in product search terms through URLSearchParams', async () => {
    const repository = { upsertMany: vi.fn(async () => undefined) };
    const fetcher = vi.fn(async () => response([]));
    const schedulerFetcher = createProductsSchedulerFetcher({
      baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
      repository,
      fetcher,
    });

    await schedulerFetcher(productTask({
      id: 'products:search:100% cotton:windowed',
      queryKey: 'products:search:100% cotton',
    }));

    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://wcpos.local/wp-json/wc-rxdb-sync/v1/products?search=100%25+cotton&per_page=25&page=1&orderby=id&order=desc');
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://wcpos.local/wp-json/wc-rxdb-sync/v1/products?sku=100%25+cotton&per_page=25&page=1&orderby=id&order=desc');
  });

  it('fetches targeted product tasks through Woo REST include and records complete coverage', async () => {
    const repository = { upsertMany: vi.fn(async () => undefined) };
    const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
    const fetcher = vi.fn(async () => response([
      { id: 321, date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(321) },
      { id: 654, date_modified_gmt: '2026-05-20T10:11:00', meta_data: posMeta(654) },
    ]));
    const schedulerFetcher = createProductsSchedulerFetcher({
      baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
      repository,
      coverageRepository,
      nowMs: () => 5_000,
      fetcher,
    });

    const result = await schedulerFetcher(productTask({
      id: 'products:ids:321,654:on-demand',
      requirementId: 'products.cart-items',
      queryKey: 'products:ids:321,654',
      ids: ['woo-product:321', 'woo-product:654'],
      wooIds: [321, 654],
      limit: 2,
      mode: 'on-demand',
    }));

    expect(fetcher).toHaveBeenCalledWith('http://wcpos.local/wp-json/wc-rxdb-sync/v1/products?include=321%2C654&per_page=2&orderby=include');
    expect(repository.upsertMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: uuidFor(321), wooProductId: 321 }),
      expect.objectContaining({ id: uuidFor(654), wooProductId: 654 }),
    ]);
    expect(coverageRepository.recordQueryResult).toHaveBeenCalledWith({
      collection: 'products',
      queryKey: 'products:ids:321,654',
      records: [{ id: 'woo-product:321' }, { id: 'woo-product:654' }],
      complete: true,
      nowMs: 5_000,
      freshForMs: 300_000,
    });
    expect(result).toEqual({
      taskId: 'products:ids:321,654:on-demand',
      documentCount: 2,
      requestCount: 1,
      completed: true,
    });
  });

  it('reads the numeric server ids from task.wooIds, decoupled from the document-key encoding', async () => {
    // ids are deliberately opaque (a uuid + garbage): the document keys are never
    // parsed — wooIds is the only channel for the numeric server ids.
    const repository = { upsertMany: vi.fn(async () => undefined) };
    const coverageRepository = { recordQueryResult: vi.fn(async () => undefined) };
    const fetcher = vi.fn(async () => response([
      { id: 321, date_modified_gmt: '2026-05-20T10:10:00', meta_data: posMeta(321) },
      { id: 654, date_modified_gmt: '2026-05-20T10:11:00', meta_data: posMeta(654) },
    ]));
    const schedulerFetcher = createProductsSchedulerFetcher({
      baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
      repository,
      coverageRepository,
      nowMs: () => 5_000,
      fetcher,
    });

    await schedulerFetcher(productTask({
      id: 'products:ids:deep-link:on-demand',
      requirementId: 'products.cart-items',
      queryKey: 'products:ids:deep-link',
      wooIds: [321, 654],
      ids: ['8e29c1a4-3b2d-4f6a-9c0e-1d2f3a4b5c6d', 'not-a-woo-product-key'],
      limit: 2,
      mode: 'on-demand',
    }));

    expect(fetcher).toHaveBeenCalledWith('http://wcpos.local/wp-json/wc-rxdb-sync/v1/products?include=321%2C654&per_page=2&orderby=include');
  });

  it('fails a targeted product task that is missing its wooIds channel (contract error, no reverse-parse)', async () => {
    // The `/^woo-product:(\d+)$/` reverse-parse scaffolding is deleted: a targeted task
    // without wooIds is a seeder contract violation, surfaced — never silently parsed.
    const repository = { upsertMany: vi.fn(async () => undefined) };
    const fetcher = vi.fn(async () => response([]));
    const schedulerFetcher = createProductsSchedulerFetcher({
      baseUrl: 'http://wcpos.local/wp-json/wc-rxdb-sync/v1',
      repository,
      fetcher,
    });

    await expect(schedulerFetcher(productTask({
      id: 'products:ids:321,654:on-demand',
      requirementId: 'products.cart-items',
      queryKey: 'products:ids:321,654',
      ids: ['woo-product:321', 'woo-product:654'],
      limit: 2,
      mode: 'on-demand',
    }))).rejects.toThrow('Targeted product scheduler task is missing its wooIds channel: products:ids:321,654:on-demand');
    expect(fetcher).not.toHaveBeenCalled();
    expect(repository.upsertMany).not.toHaveBeenCalled();
  });
});

describe('coverageRecordId', () => {
  const doc = (over: Partial<ProductDocument>): ProductDocument => ({
    id: 'woo-product:1',
    wooProductId: 1,
    payload: {} as ProductDocument['payload'],
    sync: {} as ProductDocument['sync'],
    local: { dirty: false, pendingMutationIds: [] },
    ...over,
  });

  it('keys product coverage by the stable wooId, decoupled from the storage id (uuid-ready)', () => {
    // Simulate a post-emit-flip document: uuid STORAGE key, numeric wooProductId retained.
    // Coverage must use the wooId-key so the deep-link lookup (woo-product:<wooId>) matches.
    const result = coverageRecordId(doc({ id: '5b8e1a3c-2f4d-4a6b-9c8e-1d2f3a4b5c6d', wooProductId: 321 }));
    expect(result).toBe('woo-product:321'); // the wooId-key, NOT the uuid storage id
  });

  it('falls back to the storage id for a born-local product with no wooProductId', () => {
    expect(coverageRecordId(doc({ id: 'local-keyed', wooProductId: null }))).toBe('local-keyed');
  });
});
