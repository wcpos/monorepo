import Model from './base';
import { field, nochange, date, json, action, children } from '@nozbe/watermelondb/decorators';

const sanitizeValues = (json: any) => json || {};

class User extends Model {
	static table = 'users';

	@nochange @field('remote_id') remote_id!: number;
	@field('username') username!: string;
	@field('name') name!: string;
	@field('first_name') first_name!: string;
	@field('last_name') last_name!: string;
	@field('email') email!: string;
	@field('nickname') nickname!: string;
	@field('slug') slug!: string;
	@json('meta', sanitizeValues) meta!: {};
	@field('wc_api_url') wc_api_url!: string;
}

export default User;
