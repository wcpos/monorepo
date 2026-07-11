import { promotedOrderColumns, type StoredOrderDocument } from '@woo-rxdb-lab/shared';
import type { MigrationStrategies } from 'rxdb';

export type LocalOrderDocument = StoredOrderDocument;

export const orderSchema = {
  title: 'Woo order document schema',
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    wooOrderId: { type: ['number', 'null'] },
    // Promoted filter/sort columns (duplicated out of payload, payload bytes unchanged) so RxDB
    // Mango .where()/sort can touch them. Indexed string fields require maxLength + required.
    number: { type: 'string', maxLength: 24 },
    dateCreatedGmt: { type: 'string', maxLength: 32 },
    status: { type: 'string', maxLength: 24 },
    total: { type: 'string', maxLength: 16 },
    customerId: { type: 'number' },
    payload: { type: 'object', additionalProperties: true },
    sync: { type: 'object', additionalProperties: true },
    local: { type: 'object', additionalProperties: true },
  },
  required: ['id', 'wooOrderId', 'number', 'dateCreatedGmt', 'status', 'total', 'customerId', 'payload', 'sync', 'local'],
  // The axes a POS order list sorts/filters by, as single + compound indexes.
  indexes: ['dateCreatedGmt', ['status', 'dateCreatedGmt']],
} as const;

/**
 * v0 → v1: backfill the promoted filter/sort columns from the existing payload (payload untouched).
 * The mapping is the single shared `promotedOrderColumns` projection, so a migrated doc is byte-identical
 * to a freshly-built one.
 */
export const orderMigrationStrategies: MigrationStrategies = {
  1: (doc) => ({ ...doc, ...promotedOrderColumns(doc.payload) }),
};
