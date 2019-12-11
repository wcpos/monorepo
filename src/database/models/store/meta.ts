import { field, nochange, json } from '@nozbe/watermelondb/decorators';
import Model from '../base';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Meta Data Schema
 */
export const metaSchema: Schema = {
	name: 'meta',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'parent_id', type: 'string', isIndexed: true },
		{ name: 'key', type: 'string' },
		{ name: 'value', type: 'string' },
	],
};

/**
 * Sanitize meta data values
 * @param rawValue
 */
const sanitizeValue = rawValue => {
	return Array.isArray(rawValue) ? rawValue.map(String) : [];
};

/**
 * Meta Data Model
 *
 */
export default class Meta extends Model {
	static table = 'meta';

	static associations = {
		customers: { type: 'belongs_to', foreignKey: 'parent_id' },
		orders: { type: 'belongs_to', foreignKey: 'parent_id' },
		products: { type: 'belongs_to', foreignKey: 'parent_id' },
		line_items: { type: 'belongs_to', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@field('key') key!: string;
	@json('value', sanitizeValue) value!: string | {};
}
