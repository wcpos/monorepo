import type { RemoteId } from '@wcpos/sync-core';

type RefundMetadata = { id?: number; key?: string; value?: unknown }[];

export type WooRefundPayload = Record<string, unknown> & {
	id: number;
	parent_id: number;
	date_created?: string;
	date_created_gmt: string;
	date_modified?: string;
	date_modified_gmt?: string;
	amount?: string;
	reason?: string;
	refunded_by?: number | string;
	refunded_payment?: boolean;
	total?: string;
	meta_data?: RefundMetadata;
	line_items?: {
		meta_data?: RefundMetadata;
		id?: number;
		name?: string;
		sku?: string;
		quantity?: number;
		total?: string;
		total_tax?: string;
		taxes?: { id?: number; total?: string; subtotal?: string }[];
	}[];
	tax_lines?: {
		meta_data?: RefundMetadata;
		id?: number;
		label?: string;
		tax_total?: string;
		shipping_tax_total?: string;
	}[];
	shipping_lines?: Record<string, unknown>[];
	fee_lines?: Record<string, unknown>[];
};

export type LocalRefundDocument = {
	uuid: string;
	remoteId: RemoteId;
	sessionId: string;
	payload: WooRefundPayload;
	local: { dirty: false; pendingMutationIds: string[] };
	sync: { revision: string; partial: boolean; source: 'woo-rest' };
};

export const refundSchema = {
	title: 'Woo refund document schema',
	version: 0,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: { type: 'string', maxLength: 128 },
		remoteId: { type: 'string', maxLength: 64 },
		sessionId: { type: 'string', maxLength: 64 },
		payload: {
			type: 'object',
			additionalProperties: true,
			properties: {
				parent_id: { type: 'integer', minimum: 0, maximum: 9007199254740991, multipleOf: 1 },
				date_created_gmt: { type: 'string', maxLength: 40 },
			},
			required: ['parent_id', 'date_created_gmt'],
		},
		sync: { type: 'object', additionalProperties: true },
		local: { type: 'object', additionalProperties: true },
	},
	required: ['uuid', 'remoteId', 'sessionId', 'payload', 'sync', 'local'],
	indexes: ['payload.parent_id', 'payload.date_created_gmt', 'sessionId', 'remoteId'],
} as const;
