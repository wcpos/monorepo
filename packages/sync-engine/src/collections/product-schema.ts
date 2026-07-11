import { promotedProductColumns, type StoredProductDocument } from '@wcpos/sync-core';

import type { MigrationStrategies } from 'rxdb';

export type LocalProductDocument = StoredProductDocument;

export const productSchema = {
	title: 'Woo product document schema',
	version: 2,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 128 },
		wooProductId: { type: ['number', 'null'] },
		// Promoted filter/sort columns (duplicated out of payload, payload bytes unchanged). price is
		// numeric for range filters; categoryIds/brandIds are membership arrays for multi-select.
		// Indexed number fields need bounds + multipleOf; prices are cents (rounded in promotedProductColumns).
		price: { type: 'number', minimum: 0, maximum: 100_000_000, multipleOf: 0.01 },
		stockStatus: { type: 'string', maxLength: 24 },
		type: { type: 'string', maxLength: 24 },
		categoryIds: { type: 'array', items: { type: 'number' } },
		brandIds: { type: 'array', items: { type: 'number' } },
		onSale: { type: 'boolean' },
		featured: { type: 'boolean' },
		// Decimal-capable managed stock (P2-2). DELIBERATELY no multipleOf/integer bound —
		// WooCommerce POS allows fractional stock (e.g. 3.6). Not indexed (a number-OR-null
		// field can't back an RxDB index); queryable via a scanned selector, which is enough
		// for the POS quantity filter at reference-set sizes.
		stockQuantity: { type: ['number', 'null'] },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
		local: { type: 'object', additionalProperties: true },
	},
	required: [
		'id',
		'wooProductId',
		'price',
		'stockStatus',
		'type',
		'categoryIds',
		'brandIds',
		'onSale',
		'featured',
		'stockQuantity',
		'payload',
		'sync',
		'local',
	],
	// POS product list filter axes. category/brand arrays are membership-filtered (not index-backed);
	// stock + type are the index-worthy filter axes; price backs the default product panel sort.
	indexes: ['stockStatus', 'price', ['type', 'stockStatus']],
} as const;

export const productMigrationStrategies: MigrationStrategies = {
	/** v0 → v1: backfill the promoted columns from the existing payload (payload untouched). */
	1: (doc) => ({ ...doc, ...promotedProductColumns(doc.payload) }),
	/** v1 → v2: additive — backfill the new decimal stockQuantity column from the payload. */
	2: (doc) => ({ ...doc, stockQuantity: promotedProductColumns(doc.payload).stockQuantity }),
};
