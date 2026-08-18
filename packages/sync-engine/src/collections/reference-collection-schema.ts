/**
 * Small reference collections (product categories, product brands, product tags)
 * — pull-only lookup data a POS needs for display/filtering. They share one uniform shape
 * (mirrors taxRateSchema): a stable string `uuid`, the driver identity mirrored
 * in nullable `remoteId`, the raw payload, and sync metadata. These are GREEDY
 * tier (small, sell-relevant — pain point #2
 * groups categories with tax rates).
 */

import { type RemoteId, wooIdOf } from '@wcpos/sync-core';

export type WooReferencePayload = Record<string, unknown> & { id?: number };

export type LocalReferenceDocument = {
	uuid: string;
	remoteId: RemoteId | null;
	payload: WooReferencePayload;
	sync: {
		revision: string;
		partial: boolean;
		// Uniform identity (G1): a reference record is server-born today, but the
		// type admits 'local' so the born-local case (and the deletion-prune guard
		// that depends on it) stays type-safe without a cast.
		source: 'woo-rest' | 'local';
	};
	local: {
		dirty: boolean;
		pendingMutationIds: string[];
	};
};

/** `woo-category:<n>` / `woo-brand:<n>` / `woo-tag:<n>` — the stable document id derived from the Woo id. */
export function referenceDocumentId(prefix: string, remoteId: RemoteId): string {
	return `${prefix}:${wooIdOf(remoteId)}`;
}

export const categorySchema = {
	title: 'Woo product-category document schema',
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 128 },
		remoteId: { type: ['string', 'null'], maxLength: 64 },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
		local: { type: 'object', additionalProperties: true },
	},
	required: ['uuid', 'remoteId', 'payload', 'sync', 'local'],
} as const;

export const brandSchema = {
	title: 'Woo product-brand document schema',
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 128 },
		remoteId: { type: ['string', 'null'], maxLength: 64 },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
		local: { type: 'object', additionalProperties: true },
	},
	required: ['uuid', 'remoteId', 'payload', 'sync', 'local'],
} as const;

export const tagSchema = {
	title: 'Woo product-tag document schema',
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 128 },
		remoteId: { type: ['string', 'null'], maxLength: 64 },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
		local: { type: 'object', additionalProperties: true },
	},
	required: ['uuid', 'remoteId', 'payload', 'sync', 'local'],
} as const;

// Coupons are not a taxonomy term — they are a WC_Data resource (`shop_coupon`) — but
// they share the uniform pull-only reference shape (uuid/remoteId/payload/sync); the POS
// needs them for checkout discounts. Their uuid is stamped server-side by a post
// stamper (not the term adapter), same shape the client consumes.
export const couponSchema = {
	title: 'Woo coupon document schema',
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 128 },
		remoteId: { type: ['string', 'null'], maxLength: 64 },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
		local: { type: 'object', additionalProperties: true },
	},
	required: ['uuid', 'remoteId', 'payload', 'sync', 'local'],
} as const;
