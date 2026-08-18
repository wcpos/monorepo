import { type RemoteId, wooIdOf } from '@wcpos/sync-core';

export type WooTaxRatePayload = Record<string, unknown> & {
	id?: number;
};

export type LocalTaxRateDocument = {
	uuid: string;
	remoteId: RemoteId | null;
	payload: WooTaxRatePayload;
	sync: {
		revision: string;
		partial: boolean;
		source: 'woo-rest';
	};
};

/**
 * The stable storage key for a tax rate. Unlike the other six collections (which key
 * by the server-stamped _woocommerce_pos_uuid), tax rates INTENTIONALLY key by their
 * Woo id — the single principled exception to uniform uuid identity (ADR 0009): tax
 * rates are pure-server-pull (never POS-authored), so the uuid's born-local
 * reconciliation purpose doesn't apply, and they have no native WC meta store to stamp.
 * This is NOT scaffolding awaiting a flip.
 */
export function taxRateDocumentId(remoteId: RemoteId): string {
	return `woo-tax-rate:${wooIdOf(remoteId)}`;
}

export const taxRateSchema = {
	title: 'Woo tax-rate document schema',
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 128 },
		remoteId: { type: ['string', 'null'], maxLength: 64 },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
	},
	required: ['uuid', 'remoteId', 'payload', 'sync'],
} as const;
