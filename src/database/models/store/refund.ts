import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;
type LineItem = typeof import('./line-item');
type LineItemQuery = import('@nozbe/watermelondb').Query<LineItem>;

/**
 * Refund Schema
 *
 */
export const refundSchema: Schema = {
	name: 'refunds',
	columns: [
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true, isOptional: true },
		{ name: 'date_created', type: 'string' },
		{ name: 'date_created_gmt', type: 'string' },
		{ name: 'amount', type: 'string' },
		{ name: 'reason', type: 'string' },
		{ name: 'refunded_by', type: 'number' },
		{ name: 'refunded_payment', type: 'boolean' },
		{ name: 'api_refund', type: 'boolean' },
	],
};

/**
 * Refund Model
 *
 */
export default class Refund extends Model {
	static table = 'refunds';

	static associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
		line_items: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id;
	@field('date_created') date_created!: Date;
	@field('date_created_gmt') date_created_gmt!: Date;
	@field('amount') amount!: string;
	@field('reason') reason!: string;
	@field('refunded_by') refunded_by!: number;
	@field('refunded_payment') refunded_payment!: boolean;
	@children('meta_data') meta_data!: MetaDataQuery;
	@children('line_items') line_items!: LineItemQuery;
	@field('api_refund') api_refund!: boolean;
}
