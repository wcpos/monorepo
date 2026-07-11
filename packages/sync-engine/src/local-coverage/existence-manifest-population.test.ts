// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ProductDocument } from '@woo-rxdb-lab/shared';
import { productManifestRow, stripProductManifestDigest, extractProductManifest } from './existence-manifest-population';

function productDoc(payload: Record<string, unknown>, wooProductId = 10): ProductDocument {
  return {
    id: `uuid-${wooProductId}`,
    wooProductId,
    payload: payload as ProductDocument['payload'],
    sync: { revision: 'r', partial: false, source: 'woo-rest' },
    local: { dirty: false, pendingMutationIds: [] },
  } as ProductDocument;
}

describe('productManifestRow', () => {
  it('builds a manifest row from the server-attached _rxdb_digest (string, un-truncated)', () => {
    const doc = productDoc({ id: 10, _rxdb_digest: '9223372036854775810' }); // > JS safe int
    expect(productManifestRow(doc)).toEqual({ id: '10', wooId: 10, objectType: 'product', digest: '9223372036854775810' });
  });

  it('returns null when there is no (or empty) _rxdb_digest', () => {
    expect(productManifestRow(productDoc({ id: 10 }))).toBeNull();
    expect(productManifestRow(productDoc({ id: 10, _rxdb_digest: '' }))).toBeNull();
  });
});

describe('stripProductManifestDigest', () => {
  it('removes _rxdb_digest from the stored payload (so it never pollutes the doc)', () => {
    const stripped = stripProductManifestDigest(productDoc({ id: 10, name: 'A', _rxdb_digest: 'x' }));
    expect(stripped.payload).toEqual({ id: 10, name: 'A' });
  });

  it('is a no-op (same reference) when the field is absent', () => {
    const doc = productDoc({ id: 10 });
    expect(stripProductManifestDigest(doc)).toBe(doc);
  });
});

describe('extractProductManifest', () => {
  it('splits a batch into manifest rows + cleaned documents', () => {
    const { manifestRows, documents } = extractProductManifest([
      productDoc({ id: 10, _rxdb_digest: 'a' }, 10),
      productDoc({ id: 11 }, 11), // no digest → no row, still cleaned (no-op)
    ]);
    expect(manifestRows).toEqual([{ id: '10', wooId: 10, objectType: 'product', digest: 'a' }]);
    expect(documents.every((d) => !('_rxdb_digest' in (d.payload as object)))).toBe(true);
  });
});

import { vi } from 'vitest';
import { extractCustomerManifest, withCustomerManifestPopulation } from './existence-manifest-population';
import type { LocalCustomerDocument } from '@woo-rxdb-lab/sync-engine-rxdb/testing';

function customerDoc(payload: Record<string, unknown>, wooCustomerId: number | null = 30): LocalCustomerDocument {
  return {
    id: `uuid-${wooCustomerId}`,
    wooCustomerId,
    payload: payload as LocalCustomerDocument['payload'],
    sync: { revision: 'r', partial: false, source: 'woo-rest' },
    local: { dirty: false, pendingMutationIds: [] },
  } as LocalCustomerDocument;
}

describe('extractCustomerManifest', () => {
  it('builds a customer manifest row (objectType customer) from _rxdb_digest and strips it', () => {
    const { manifestRows, documents } = extractCustomerManifest([
      customerDoc({ id: 30, _rxdb_digest: '9223372036854775810' }, 30),
      customerDoc({ id: 31 }, 31), // no digest
      customerDoc({ id: 0, _rxdb_digest: 'x' }, null), // born-local (no wooId) → no row
    ]);
    expect(manifestRows).toEqual([{ id: '30', wooId: 30, objectType: 'customer', digest: '9223372036854775810' }]);
    expect(documents.every((d) => !('_rxdb_digest' in (d.payload as object)))).toBe(true);
  });
});

describe('withCustomerManifestPopulation', () => {
  it('on upsert: stores stripped docs via the base repo, then seeds the customer manifest', async () => {
    const baseUpsert = vi.fn(async (_docs: LocalCustomerDocument[]) => undefined);
    const bulkUpsert = vi.fn(async () => undefined);
    const repo = withCustomerManifestPopulation(
      { upsertMany: baseUpsert },
      { bulkUpsert, bulkRemove: vi.fn(), find: vi.fn() } as never,
    );

    await repo.upsertMany([customerDoc({ id: 30, name: 'A', _rxdb_digest: 'd30' }, 30)]);

    // Base stores the cleaned doc (no _rxdb_digest).
    const stored = (baseUpsert.mock.calls[0] as unknown as [LocalCustomerDocument[]])[0][0];
    expect('_rxdb_digest' in (stored.payload as object)).toBe(false);
    // Manifest seeded with the customer row.
    expect(bulkUpsert).toHaveBeenCalledWith([{ id: '30', wooId: 30, objectType: 'customer', digest: 'd30' }]);
  });

  it('does not touch the manifest when no customer carries a digest', async () => {
    const bulkUpsert = vi.fn(async () => undefined);
    const repo = withCustomerManifestPopulation(
      { upsertMany: vi.fn(async (_docs: LocalCustomerDocument[]) => undefined) },
      { bulkUpsert, bulkRemove: vi.fn(), find: vi.fn() } as never,
    );
    await repo.upsertMany([customerDoc({ id: 30 }, 30)]);
    expect(bulkUpsert).not.toHaveBeenCalled();
  });
});

import { extractOrderManifest } from './existence-manifest-population';
import type { OrderDocument } from '@woo-rxdb-lab/shared';

describe('extractOrderManifest', () => {
  const orderDoc = (wooOrderId: number | null, payload: Record<string, unknown>): OrderDocument =>
    ({ id: `uuid-${wooOrderId}`, wooOrderId, payload, sync: { revision: 'r', partial: false, source: 'woo-rest' }, local: { dirty: false, pendingMutationIds: [] } } as unknown as OrderDocument);

  it('builds an order manifest row (objectType order) from _rxdb_digest and strips it', () => {
    const { manifestRows, documents } = extractOrderManifest([
      orderDoc(77, { id: 77, _rxdb_digest: '9223372036854775810' }),
      orderDoc(78, { id: 78 }), // no digest
      orderDoc(null, { id: 0, _rxdb_digest: 'x' }), // born-local (no wooOrderId)
    ]);
    expect(manifestRows).toEqual([{ id: '77', wooId: 77, objectType: 'order', digest: '9223372036854775810' }]);
    expect(documents.every((d) => !('_rxdb_digest' in (d.payload as object)))).toBe(true);
  });
});
