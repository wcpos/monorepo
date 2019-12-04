import Model from './base';
import { field, nochange, date, json } from '@nozbe/watermelondb/decorators';
import http from '../../lib/http';

import { BillingProps, ShippingProps, MetaDataProps } from './types';

const sanitizeValues = (json: any) => json || {};

export default class Customer extends Model {
	static table = 'customers';

	@nochange @field('remote_id') remote_id!: number;
	@field('date_created') date_created!: string;
	@date('date_created_gmt') date_created_gmt!: string;
	@date('date_modified') date_modified!: string;
	@date('date_modified_gmt') date_modified_gmt!: string;
	@field('email') email!: string;
	@field('first_name') first_name!: string;
	@field('last_name') last_name!: string;
	@field('role') role!: string;
	@field('username') username!: string;
	@field('password') password!: string;
	@json('billing', sanitizeValues) billing!: BillingProps;
	@json('shipping', sanitizeValues) shipping!: ShippingProps;
	@field('is_paying_customer') is_paying_customer!: boolean;
	@field('avatar_url') avatar_url!: string;
	@json('meta_data', sanitizeValues) meta_data!: MetaDataProps;

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
}
