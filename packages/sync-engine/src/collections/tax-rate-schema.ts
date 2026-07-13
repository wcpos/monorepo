export type WooTaxRatePayload = Record<string, unknown> & {
	id?: number;
};

export type LocalTaxRateDocument = {
	id: string;
	wooTaxRateId: number | null;
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
export function taxRateDocumentId(taxRateId: number): string {
	return `woo-tax-rate:${taxRateId}`;
}

export const taxRateSchema = {
	title: 'Woo tax-rate document schema',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 128 },
		wooTaxRateId: { type: ['number', 'null'] },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
	},
	required: ['id', 'wooTaxRateId', 'payload', 'sync'],
} as const;
