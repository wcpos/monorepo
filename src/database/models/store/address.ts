import { field } from '@nozbe/watermelondb/decorators';
import Model from '../base';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Address Schema
 *
 */
export const addressSchema: Schema = {
	name: 'addresses',
	columns: [
		{ name: 'customer_id', type: 'string', isIndexed: true },
		{ name: 'order_id', type: 'string', isIndexed: true },
		{ name: 'type', type: 'string' },
		{ name: 'address_1', type: 'string' },
		{ name: 'address_2', type: 'string' },
		{ name: 'city', type: 'string' },
		{ name: 'company', type: 'string' },
		{ name: 'country', type: 'string' },
		{ name: 'email', type: 'string' },
		{ name: 'first_name', type: 'string' },
		{ name: 'last_name', type: 'string' },
		{ name: 'phone', type: 'string' },
		{ name: 'postcode', type: 'string' },
		{ name: 'state', type: 'string' },
	],
};

/**
 * Address Model
 *
 */
export default class Address extends Model {
	static table = 'addresses';

	static associations = {
		customers: { type: 'belongs_to', key: 'customer_id' },
		orders: { type: 'belongs_to', key: 'order_id' },
	};

	@field('type') type!: 'billing' | 'shipping';

	@field('address_1') address_1!: string;
	@field('address_2') address_2!: string;
	@field('city') city!: string;
	@field('company') company!: string;
	@field('country') country!: string;
	@field('email') email!: string;
	@field('first_name') first_name!: string;
	@field('last_name') last_name!: string;
	@field('phone') phone!: string;
	@field('postcode') postcode!: string;
	@field('state') state!: string;
}
