import { field, nochange } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Tax Schema
 *
 */
export const taxRateSchema: Schema = {
	name: 'tax_rates',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'country', type: 'string' },
		{ name: 'state', type: 'string' },
		{ name: 'postcode', type: 'string' },
		{ name: 'city', type: 'string' },
		{ name: 'rate', type: 'string' },
		{ name: 'name', type: 'string' },
		{ name: 'priority', type: 'number' },
		{ name: 'compound', type: 'boolean' },
		{ name: 'shipping', type: 'boolean' },
		{ name: 'order', type: 'number' },
		{ name: 'class', type: 'string' },
	],
};

/**
 * Tax Model
 *
 */
export default class TaxRate extends Model {
	static table = 'tax_rates';

	@nochange @field('remote_id') remote_id!: number;
	@field('country') country!: string;
	@field('state') state!: string;
	@field('postcode') postcode!: string;
	@field('city') city!: string;
	@field('rate') rate!: string;
	@field('name') name!: string;
	@field('priority') priority!: number;
	@field('compound') compound!: boolean;
	@field('shipping') shipping!: boolean;
	@field('order') order!: number;
	@field('class') class!: string;
}
