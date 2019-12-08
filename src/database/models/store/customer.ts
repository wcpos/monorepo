import { Q } from '@nozbe/watermelondb';
import { field, nochange, relation } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { address, children, date } from '../decorators';
import http from '../../../lib/http';

export default class Customer extends Model {
	static table = 'customers';

	static associations = {
		addresses: { type: 'has_many', foreignKey: 'customer_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@date('date_created') date_created!: string;
	@date('date_created_gmt') date_created_gmt!: string;
	@date('date_modified') date_modified!: string;
	@date('date_modified_gmt') date_modified_gmt!: string;
	@field('email') email!: string;
	@field('first_name') first_name!: string;
	@field('last_name') last_name!: string;
	@field('role') role!: string;
	@field('username') username!: string;
	@field('password') password!: string;
	@address('addresses', 'billing_id') billing!: any;
	@address('addresses', 'shipping_id') shipping!: any;
	@field('is_paying_customer') is_paying_customer!: boolean;
	@field('avatar_url') avatar_url!: string;
	@children('meta') meta_data!: any;

	get name() {
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
