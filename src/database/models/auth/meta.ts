import { field, nochange, json } from '@nozbe/watermelondb/decorators';
import Model from '../base';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

const TABLE_NAME = 'meta';

/**
 * Meta Data Schema
 */
export const metaSchema: Schema = {
	name: TABLE_NAME,
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true, isOptional: true },
		{ name: 'parent_id', type: 'string', isIndexed: true },
		{ name: 'key', type: 'string' },
		{ name: 'value', type: 'string' },
	],
};

/**
 * Sanitize meta data values
 * @param rawValue
 */
// const sanitizeValue = rawValue => {
// 	return Array.isArray(rawValue) ? rawValue.map(String) : [];
// };

/**
 * Meta Data Model
 *
 */
export default class Meta extends Model {
	static table = TABLE_NAME;

	static associations = {
		app_users: { type: 'belongs_to', key: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@field('key') key!: string;
	@field('value') value!: string | {};
}
