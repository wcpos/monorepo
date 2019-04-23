import { Q } from '@nozbe/watermelondb';
import { field, nochange, json, lazy } from '@nozbe/watermelondb/decorators';
import Model from './base';

const sanitizeValues = (json: any) => json || {};

class User extends Model {
	static table = 'users';

	static associations = {
		site_users: { type: 'has_many', foreignKey: 'user_id' },
	};

	@lazy
	sites = this.collections.get('sites').query(Q.on('site_users', 'user_id', this.id));

	@nochange @field('remote_id') remote_id!: number;
	@field('username') username!: string;
	@field('name') name!: string;
	@field('first_name') first_name!: string;
	@field('last_name') last_name!: string;
	@field('email') email!: string;
	@field('nickname') nickname!: string;
	@field('slug') slug!: string;
	// @field('consumer_key') consumer_key!: string;
	// @field('consumer_secret') consumer_secret!: string;
	@field('last_access') last_access!: string;
	@json('meta', sanitizeValues) meta!: {};
}

export default User;
