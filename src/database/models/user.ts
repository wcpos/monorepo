import { Q } from '@nozbe/watermelondb';
import { field, nochange, json, immutableRelation } from '@nozbe/watermelondb/decorators';
import Model from './base';

const sanitizeValues = (json: any) => json || {};

class User extends Model {
	static table = 'users';

	static associations = {
		sites: { type: 'belongs_to', key: 'site_id' },
	};

	@immutableRelation('sites', 'site_id') site!: any;

	@field('remote_id') remote_id!: number;
	@field('username') username!: string;
	@field('name') name!: string;
	@field('first_name') first_name!: string;
	@field('last_name') last_name!: string;
	@field('email') email!: string;
	@field('nickname') nickname!: string;
	@field('slug') slug!: string;
	@field('last_access') last_access!: string;
	@json('meta', sanitizeValues) meta!: {};
	@field('consumer_key') consumer_key!: string;
	@field('consumer_secret') consumer_secret!: string;

	isAuthenticated() {
		return this.consumer_key && this.consumer_secret;
	}
}

export default User;
