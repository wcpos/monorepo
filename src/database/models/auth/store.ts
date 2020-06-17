import { field, nochange, immutableRelation } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Model from '../base';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const TABLE_NAME = 'stores';

/**
 * Store Schema
 *
 */
export const storeSchema: Schema = {
	name: TABLE_NAME,
	columns: [
		{ name: 'remote_id', type: 'string', isIndexed: true },
		{ name: 'app_user_id', type: 'string', isIndexed: true },
		{ name: 'wp_user_id', type: 'string', isIndexed: true },
		{ name: 'name', type: 'string' },
	],
};

/**
 * Store Model
 *
 */
class Store extends Model {
	static table = TABLE_NAME;

	static associations: Associations = {
		app_users: { type: 'belongs_to', key: 'app_user_id' },
		wp_users: { type: 'belongs_to', key: 'wp_user_id' },
		uis: { type: 'has_many', foreignKey: 'store_id' },
	};

	@immutableRelation('app_users', 'app_user_id') app_user!: any;
	@immutableRelation('wp_users', 'wp_user_id') wp_user!: any;

	@field('remote_id') remote_id!: number;
	@field('name') name!: string;
}

export default Store;
