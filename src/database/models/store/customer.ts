import { Q } from '@nozbe/watermelondb';
import { field, nochange, relation } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { address, children, date } from '../decorators';
import http from '../../../lib/http';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;
type Address = typeof import('./address');
type AddressRelation = import('@nozbe/watermelondb').Relation<Address>;

/**
 * Customer Schema
 *
 */
export const customerSchema: Schema = {
	name: 'customers',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'date_created', type: 'string' },
		{ name: 'date_created_gmt', type: 'string' },
		{ name: 'date_modified', type: 'string' },
		{ name: 'date_modified_gmt', type: 'string' },
		{ name: 'email', type: 'string' },
		{ name: 'first_name', type: 'string' },
		{ name: 'last_name', type: 'string' },
		{ name: 'role', type: 'string' },
		{ name: 'username', type: 'string' },
		{ name: 'password', type: 'string' },
		{ name: 'is_paying_customer', type: 'boolean' },
		{ name: 'avatar_url', type: 'string' },
		{ name: 'billing_id', type: 'string' },
		{ name: 'shipping_id', type: 'string' },
	],
};

/**
 * Customer Model
 *
 */
export default class Customer extends Model {
	static table = 'customers';

	static associations = {
		addresses: { type: 'has_many', foreignKey: 'customer_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@date('date_created') date_created!: Date;
	@date('date_created_gmt') date_created_gmt!: Date;
	@date('date_modified') date_modified!: Date;
	@date('date_modified_gmt') date_modified_gmt!: Date;
	@field('email') email!: string;
	@field('first_name') first_name!: string;
	@field('last_name') last_name!: string;
	@field('role') role!: string;
	@field('username') username!: string;
	@field('password') password!: string;
	@address('addresses', 'billing_id') billing!: AddressRelation;
	@address('addresses', 'shipping_id') shipping!: AddressRelation;
	@field('is_paying_customer') is_paying_customer!: boolean;
	@field('avatar_url') avatar_url!: string;
	@children('meta') meta_data!: MetaDataQuery;

	/**
	 *
	 */
	get name(): string {
		return this.first_name + ' ' + this.last_name;
	}

	/**
	 *
	 */
	async fetch() {
		const response = await http(
			'https://dev.local/wp/latest/wp-json/wc/v3/customers/' + this.remote_id,
			{
				auth: {
					username: 'ck_c0cba49ee21a37ef95d915e03631c7afd53bc8df',
					password: 'cs_6769030f21591d37cd91e5983ebe532521fa875a',
				},
			}
		);

		await this.database.action(async () => {
			await this.update(customer => {
				this.updateFromJSON(response.data);
			});
		});
	}

	/**
	 *
	 */
	async toJSON() {
		const json = super.toJSON();
		const billing = await this.billing.fetch();
		const shipping = await this.shipping.fetch();
		const meta = await this.meta_data.fetch();
		json.billing = billing?.toJSON();
		json.shipping = shipping?.toJSON();
		json.meta_data = meta.map(m => m.toJSON());
		return json;
	}
}
