import { field, immutableRelation } from '@nozbe/watermelondb/decorators';
import Model from './base';

export default class Address extends Model {
	static table = 'addresses';

	static associations = {
		customers: { type: 'belongs_to', key: 'customer_id' },
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
