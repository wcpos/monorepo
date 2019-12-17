import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;

/**
 * Tax Schema
 *
 */
export const taxSchema: Schema = {
	name: 'taxes',
	columns: [
		{ name: 'parent_id', type: 'string', isIndexed: true },
		{ name: 'remote_id', type: 'number', isIndexed: true, isOptional: true },
		{ name: 'rate_code', type: 'string' },
		{ name: 'rate_id', type: 'string' },
		{ name: 'label', type: 'string' },
		{ name: 'compound', type: 'boolean' },
		{ name: 'tax_total', type: 'string' },
		{ name: 'shipping_tax_total', type: 'string' },
	],
};

/**
 * Tax Model
 *
 */
export default class Tax extends Model {
	static table = 'taxes';

	static associations = {
		orders: { type: 'belongs_to', key: 'parent_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@field('rate_code') rate_code!: string;
	@field('rate_id') rate_id!: string;
	@field('label') label!: string;
	@field('compound') compound!: boolean;
	@field('tax_total') tax_total!: string;
	@field('shipping_tax_total') shipping_tax_total!: string;
	@children('meta') meta_data!: MetaDataQuery;
}
