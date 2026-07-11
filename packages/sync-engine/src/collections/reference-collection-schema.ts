/**
 * Small reference collections (product categories, product brands, product tags)
 * — pull-only lookup data a POS needs for display/filtering. They share one uniform shape
 * (mirrors taxRateSchema): a string `id` derived from the Woo id, the numeric
 * Woo id mirrored in nullable `wooId`, the raw payload, and sync metadata. Per
 * the identity guardrail (G1) the key is stable and never re-keyed; `wooId` is a
 * field, not the key. These are GREEDY tier (small, sell-relevant — pain point #2
 * groups categories with tax rates).
 */

export type WooReferencePayload = Record<string, unknown> & { id?: number };

export type LocalReferenceDocument = {
	id: string;
	wooId: number | null;
	payload: WooReferencePayload;
	sync: {
		revision: string;
		partial: boolean;
		// Uniform identity (G1): a reference record is server-born today, but the
		// type admits 'local' so the born-local case (and the deletion-prune guard
		// that depends on it) stays type-safe without a cast.
		source: 'woo-rest' | 'local';
	};
};

/** `woo-category:<n>` / `woo-brand:<n>` / `woo-tag:<n>` — the stable document id derived from the Woo id. */
export function referenceDocumentId(prefix: string, wooId: number): string {
	return `${prefix}:${wooId}`;
}

export const categorySchema = {
	title: 'Woo product-category document schema',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 128 },
		wooId: { type: ['number', 'null'] },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
	},
	required: ['id', 'wooId', 'payload', 'sync'],
} as const;

export const brandSchema = {
	title: 'Woo product-brand document schema',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 128 },
		wooId: { type: ['number', 'null'] },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
	},
	required: ['id', 'wooId', 'payload', 'sync'],
} as const;

export const tagSchema = {
	title: 'Woo product-tag document schema',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 128 },
		wooId: { type: ['number', 'null'] },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
	},
	required: ['id', 'wooId', 'payload', 'sync'],
} as const;

// Coupons are not a taxonomy term — they are a WC_Data resource (`shop_coupon`) — but
// they share the uniform pull-only reference shape (id/wooId/payload/sync); the POS
// needs them for checkout discounts. Their uuid is stamped server-side by a post
// stamper (not the term adapter), same shape the client consumes.
export const couponSchema = {
	title: 'Woo coupon document schema',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 128 },
		wooId: { type: ['number', 'null'] },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
	},
	required: ['id', 'wooId', 'payload', 'sync'],
} as const;
