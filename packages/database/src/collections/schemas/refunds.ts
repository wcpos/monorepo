import { ordersLiteral } from './orders';

/** Woo refund payload, not a second legacy store collection. */
export const refundsLiteral = {
	title: 'Woo refund payload schema',
	version: 0,
	type: 'object',
	primaryKey: 'uuid',
	properties: {
		uuid: { type: 'string', maxLength: 128 },
		id: { type: 'integer' },
		parent_id: { type: 'integer' },
		date_created: { type: 'string' },
		date_created_gmt: { type: 'string' },
		date_modified: { type: 'string' },
		date_modified_gmt: { type: 'string' },
		amount: { type: 'string' },
		reason: { type: 'string' },
		refunded_by: { type: ['number', 'string'] },
		refunded_payment: { type: 'boolean' },
		total: { type: 'string' },
		meta_data: ordersLiteral.properties.meta_data,
		line_items: ordersLiteral.properties.line_items,
		tax_lines: ordersLiteral.properties.tax_lines,
		shipping_lines: ordersLiteral.properties.shipping_lines,
		fee_lines: ordersLiteral.properties.fee_lines,
	},
	required: ['id', 'parent_id', 'date_created_gmt'],
} as const;
