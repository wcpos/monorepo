import { Q } from '@nozbe/watermelondb';
import { field, nochange, json, immutableRelation } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import { children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const TABLE_NAME = 'wp_users';

/**
 * WordPress User Schema
 *
 */
export const wpUserSchema: Schema = {
	name: TABLE_NAME,
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true, isOptional: true },
		{ name: 'site_id', type: 'string', isIndexed: true },
		{ name: 'username', type: 'string' },
		{ name: 'name', type: 'string' },
		{ name: 'first_name', type: 'string' },
		{ name: 'last_name', type: 'string' },
		{ name: 'email', type: 'string' },
		{ name: 'nickname', type: 'string' },
		{ name: 'slug', type: 'string' },
		{ name: 'last_access', type: 'string' },
		{ name: 'roles', type: 'string' },
		{ name: 'locale', type: 'string' },
		{ name: 'consumer_key', type: 'string' },
		{ name: 'consumer_secret', type: 'string' },
	],
};

/**
 * WordPress User Model
 *
 */
class WpUser extends Model {
	static table = TABLE_NAME;

	static associations = {
		sites: { type: 'belongs_to', key: 'site_id' },
		stores: { type: 'has_many', foreignKey: 'wp_user_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@immutableRelation('sites', 'parent_id') site!: any;

	@children('stores') stores!: any;

	@field('remote_id') remote_id!: number;
	@field('username') username!: string;
	@field('name') name!: string;
	@field('first_name') first_name!: string;
	@field('last_name') last_name!: string;
	@field('email') email!: string;
	@field('nickname') nickname!: string;
	@field('slug') slug!: string;
	@field('last_access') last_access!: string;
	@children('meta') meta!: {};
	@field('consumer_key') consumer_key!: string;
	@field('consumer_secret') consumer_secret!: string;

	get authenticated() {
		return this.isAuthenticated();
	}

	isAuthenticated() {
		return this.consumer_key && this.consumer_secret;
	}
}

export default WpUser;
