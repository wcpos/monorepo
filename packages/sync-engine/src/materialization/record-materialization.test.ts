import { describe, expect, it } from 'vitest';
import { materializeGreedyPrunable, materializeLocalOnly, materializeTargeted, materializeUpsertRefresh } from './record-materialization';

const uuid = '00000000-0000-4000-8000-000000000007';
const meta_data = [{ key: '_woocommerce_pos_uuid', value: uuid }];

describe('record materialization seam', () => {
  it('owns stamped revision adoption, legacy fallback, identity, digest routing, and promoted product fields', () => {
    const stamped = materializeTargeted('products', { id: 7, name: 'Hat', price: '12.34', status: 'publish', date_modified_gmt: 'legacy', meta_data, _rxdb_revision: 'server-r', _rxdb_digest: 'digest-7' });
    expect(stamped.storedDocument).toMatchObject({ id: uuid, wooProductId: 7, price: 12.34, sync: { revision: 'server-r' } });
    expect(stamped.storedDocument.payload).not.toHaveProperty('_rxdb_revision');
    expect(stamped.storedDocument.payload).not.toHaveProperty('_rxdb_digest');
    expect(stamped.manifestRow).toMatchObject({ wooId: 7, objectType: 'product', digest: 'digest-7' });
    expect(materializeTargeted('products', { id: 7, date_modified_gmt: 'legacy', meta_data }).storedDocument).toMatchObject({ sync: { revision: 'legacy' } });
  });

  it('projects every descriptor shape without minting a missing uuid', () => {
    expect(() => materializeTargeted('customers', { id: 7 })).toThrow();
    expect(materializeTargeted('variations', { id: 7, parent_id: 3, attributes: [], meta_data }).storedDocument).toMatchObject({ id: uuid, wooId: 7, parentId: 3, attributes: [] });
    expect(materializeGreedyPrunable({ id: 7, name: 'Term', meta_data }).storedDocument).toMatchObject({ id: uuid, wooId: 7 });
    expect(materializeUpsertRefresh({ id: 7 } as never).storedDocument).toMatchObject({ id: 'woo-tax-rate:7', wooTaxRateId: 7 });
    expect(materializeLocalOnly({ id: 7, status: 'processing', meta_data } as never).storedDocument).toMatchObject({ id: uuid, wooOrderId: 7, payload: { status: 'processing' } });
  });

  it('is the only production module importing revision adoption (drift guard)', () => {
    const sources = (import.meta as ImportMeta & { glob: (pattern: string, options: Record<string, unknown>) => Record<string, string> })
      .glob('./*.ts', { eager: true, query: '?raw', import: 'default' });
    const importers = Object.entries(sources).filter(([name, source]) => !name.endsWith('.test.ts') && source.includes("from '../write-path/adopt-stamped-revision'"));
    expect(importers.map(([name]) => name)).toEqual(['./record-materialization.ts']);
  });
});
