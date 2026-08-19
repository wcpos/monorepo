import { type RemoteId } from '@wcpos/sync-core';

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
