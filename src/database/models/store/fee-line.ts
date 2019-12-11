import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;
type Tax = typeof import('./tax');
type TaxQuery = import('@nozbe/watermelondb').Query<Tax>;

/**
 * Fee Line Schema
 *
 */
export const feeLineSchema: Schema = {
	name: 'fee_lines',
	columns: [
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'name', type: 'string' },
		{ name: 'tax_class', type: 'string' },
		{ name: 'tax_status', type: 'string' },
		{ name: 'total', type: 'string' },
		{ name: 'tax_total', type: 'string' },
	],
};

/**
 * Fee Line Model
 *
 */
export default class FeeLine extends Model {
	static table = 'fee_lines';

	static associations = {
		orders: { type: 'belongs_to', key: 'order_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
		taxes: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@field('name') name!: string;
	@field('tax_class') tax_class!: string;
	@field('tax_status') tax_status!: string;
	@field('total') total!: string;
	@field('tax_total') tax_total!: string;
	@children('taxes') taxes!: TaxQuery;
	@children('meta') meta_data!: MetaDataQuery;
}
