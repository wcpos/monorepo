/**
 * Shared `TaxId` sub-schema, used inside both `customers` and `orders` (top-level
 * `tax_ids` array on each).
 *
 * Mirrors the canonical PHP `TaxId` shape produced by Tax_Id_Reader / accepted by
 * Tax_Id_Writer. Keep the type union and field set in sync with
 * `Services/Tax_Id_Types::all_types()`.
 */
export const taxIdLiteral = {
	type: 'object',
	properties: {
		type: {
			type: 'string',
			enum: [
				'eu_vat',
				'gb_vat',
				'au_abn',
				'br_cpf',
				'br_cnpj',
				'in_gst',
				'it_cf',
				'it_piva',
				'es_nif',
				'ar_cuit',
				'sa_vat',
				'ca_gst_hst',
				'us_ein',
				'other',
			],
		},
		value: {
			type: 'string',
		},
		country: {
			type: ['string', 'null'],
		},
		label: {
			type: ['string', 'null'],
		},
		verified: {
			type: ['object', 'null'],
			properties: {
				status: {
					type: 'string',
					enum: ['verified', 'unverified', 'pending'],
				},
				source: {
					type: 'string',
				},
				verified_name: {
					type: 'string',
				},
				verified_at: {
					type: 'string',
				},
			},
			required: ['status'],
		},
	},
} as const;

/**
 * Type aliases derived from the literal schema. Source of truth for the TS
 * `TaxId` type used across the client.
 */
export type TaxIdType =
	| 'eu_vat'
	| 'gb_vat'
	| 'au_abn'
	| 'br_cpf'
	| 'br_cnpj'
	| 'in_gst'
	| 'it_cf'
	| 'it_piva'
	| 'es_nif'
	| 'ar_cuit'
	| 'sa_vat'
	| 'ca_gst_hst'
	| 'us_ein'
	| 'other';

export interface TaxIdVerified {
	status: 'verified' | 'unverified' | 'pending';
	source?: string;
	verified_name?: string;
	verified_at?: string;
}

export interface TaxId {
	type: TaxIdType;
	value: string;
	country: string | null;
	label: string | null;
	verified: TaxIdVerified | null;
}

export const TAX_ID_TYPES: readonly TaxIdType[] = [
	'eu_vat',
	'gb_vat',
	'au_abn',
	'br_cpf',
	'br_cnpj',
	'in_gst',
	'it_cf',
	'it_piva',
	'es_nif',
	'ar_cuit',
	'sa_vat',
	'ca_gst_hst',
	'us_ein',
	'other',
] as const;
