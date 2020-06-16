import { field, nochange } from '@nozbe/watermelondb/decorators';
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
		wp_users: { type: 'belongs_to', key: 'wp_user_id' },
		uis: { type: 'has_many', foreignKey: 'store_id' },
	};

	@field('remote_id') remote_id!: number;
	@field('name') name!: string;
}

export default Store;
