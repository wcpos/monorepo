export type WooCustomerPayload = Record<string, unknown> & {
	id?: number;
	date_modified_gmt?: string;
	date_modified?: string;
};

export type LocalCustomerDocument = {
	id: string;
	wooCustomerId: number | null;
	payload: WooCustomerPayload;
	sync: {
		revision: string;
		partial: boolean;
		source: 'woo-rest';
	};
	local: {
		dirty: boolean;
		pendingMutationIds: string[];
	};
};

// The Woo-id-space coverage key lives in the shared protocol alongside
// orderDocumentId/productDocumentId (decoupled from the uuid storage key);
// re-exported here so existing schema-local imports keep working.
export { customerDocumentId } from '@wcpos/sync-core';

export const customerSchema = {
	title: 'Woo customer document schema',
	version: 0,
	primaryKey: 'id',
	type: 'object',
	properties: {
		id: { type: 'string', maxLength: 128 },
		wooCustomerId: { type: ['number', 'null'] },
		payload: { type: 'object', additionalProperties: true },
		sync: { type: 'object', additionalProperties: true },
		local: { type: 'object', additionalProperties: true },
	},
	required: ['id', 'wooCustomerId', 'payload', 'sync', 'local'],
} as const;
