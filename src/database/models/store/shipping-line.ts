import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;
type Tax = typeof import('./tax');
type TaxQuery = import('@nozbe/watermelondb').Query<Tax>;

/**
 * Shipping Line Schema
 *
 */
export const shippingLineSchema: Schema = {
	name: 'shipping_lines',
	columns: [
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'method_title', type: 'string' },
		{ name: 'method_id', type: 'string' },
		{ name: 'total', type: 'string' },
		{ name: 'tax_total', type: 'string' },
	],
};

/**
 * Shipping Line Model
 *
 */
export default class ShippingLine extends Model {
	static table = 'shipping_lines';

	static associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
		taxes: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@field('method_title') method_title!: string;
	@field('method_id') method_id!: string;
	@field('total') total!: string;
	@field('tax_total') tax_total!: string;
	@field('shipping_tax_total') shipping_tax_total!: string;
	@children('taxes') taxes!: MetaDataQuery;
	@children('meta') meta_data!: TaxQuery;
}
