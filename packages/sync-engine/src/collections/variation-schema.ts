/**
 * Product variations — first-class local records (CONTEXT.md: their own
 * collection, indexed barcode + parent reference). Pulled ON DEMAND via the
 * lab-namespace `wc-rxdb-sync/v1/variations?include=<ids>` endpoint, which
 * resolves the parent server-side. The stable string `id` is derived from the
 * Woo id; `wooId` and `parentId` are mirrored fields (never the key — G1).
 */
import type { MigrationStrategies } from 'rxdb';
import { finiteOrNull } from '@woo-rxdb-lab/shared';

export type WooVariationPayload = Record<string, unknown> & { id?: number };

export type LocalVariationDocument = {
  id: string;
  wooId: number | null;
  parentId: number | null;
  payload: WooVariationPayload;
  sync: {
    revision: string;
    partial: boolean;
    source: 'woo-rest';
  };
};

/** A normalized variation attribute. The WooCommerce "Any <attribute>" case is modeled as ABSENCE
 * (the entry is dropped), so the variation filter's `$not $elemMatch` "any" semantics work uniformly
 * whether the source sent the attribute absent or with an empty option. */
export type VariationAttribute = { id: number; name: string; option: string };

/** Promoted variation filter/sort columns. `attributes` is promoted out of payload so the variation
 * attribute filter (`$or[$not $elemMatch {id,name}, $elemMatch {id,name,option}]`) is Mango-queryable. */
export type PromotedVariationColumns = {
  price: number;
  stockStatus: string;
  attributes: VariationAttribute[];
  /** Decimal-capable managed stock (P2-2). null when stock management is off. */
  stockQuantity: number | null;
};

export type StoredVariationDocument = LocalVariationDocument & PromotedVariationColumns;

/** Normalize a variation's `attributes`: coerce each entry and DROP "any" entries (empty option) and
 * nameless entries, so "any" becomes absence (the filter key is `{id,name}`). */
function normalizeVariationAttributes(value: unknown): VariationAttribute[] {
  return Array.isArray(value)
    ? value
        .map((entry) => ({
          id: Number((entry as { id?: unknown } | null)?.id) || 0,
          name: String((entry as { name?: unknown } | null)?.name ?? ''),
          option: String((entry as { option?: unknown } | null)?.option ?? ''),
        }))
        .filter((attr) => attr.name !== '' && attr.option !== '')
    : [];
}

/** Project the promoted variation columns from a Woo variation payload. Pure. */
export function promotedVariationColumns(payload: WooVariationPayload): PromotedVariationColumns {
  return {
    price: Number(payload.price) || 0,
    stockStatus: String(payload.stock_status ?? ''),
    attributes: normalizeVariationAttributes(payload.attributes),
    // Decimal-preserving (no (int) coercion); null when stock management is off.
    stockQuantity: finiteOrNull(payload.stock_quantity),
  };
}

/** Attach the promoted columns (derived from `doc.payload`) to a variation document for storage. */
export function withVariationColumns<T extends { payload: WooVariationPayload }>(doc: T): T & PromotedVariationColumns {
  return { ...doc, ...promotedVariationColumns(doc.payload) };
}

export const variationSchema = {
  title: 'Woo product-variation document schema',
  version: 2,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 128 },
    wooId: { type: ['number', 'null'] },
    parentId: { type: ['number', 'null'] },
    // Promoted filter columns (duplicated out of payload, payload bytes unchanged).
    price: { type: 'number' },
    stockStatus: { type: 'string', maxLength: 24 },
    attributes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' },
          option: { type: 'string' },
        },
      },
    },
    // Decimal-capable managed stock (P2-2) — no integer bound (WooCommerce POS allows
    // fractional stock). Not indexed (number-or-null can't back an RxDB index).
    stockQuantity: { type: ['number', 'null'] },
    payload: { type: 'object', additionalProperties: true },
    sync: { type: 'object', additionalProperties: true },
  },
  required: ['id', 'wooId', 'parentId', 'price', 'stockStatus', 'attributes', 'stockQuantity', 'payload', 'sync'],
} as const;

export const variationMigrationStrategies: MigrationStrategies = {
  /** v0 → v1: backfill the promoted columns from the existing payload (payload untouched). */
  1: (doc) => ({ ...doc, ...promotedVariationColumns(doc.payload) }),
  /** v1 → v2: additive — backfill the new decimal stockQuantity column from the payload. */
  2: (doc) => ({ ...doc, stockQuantity: promotedVariationColumns(doc.payload).stockQuantity }),
};
