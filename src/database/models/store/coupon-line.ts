import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;

/**
 * Coupon Line Schema
 *
 */
export const couponLineSchema: Schema = {
	name: 'coupon_lines',
	columns: [
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'code', type: 'string' },
		{ name: 'discount', type: 'string' },
		{ name: 'discount_tax', type: 'string' },
	],
};

/**
 * Coupon Line Model
 *
 */
export default class CouponLine extends Model {
	static table = 'coupon_lines';

	static associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@field('code') code!: string;
	@field('discount') discount!: string;
	@field('discount_tax') discount_tax!: string;
	@children('meta') meta_data!: MetaDataQuery;
}
