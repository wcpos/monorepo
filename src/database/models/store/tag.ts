import { Q } from '@nozbe/watermelondb';
import { field, nochange, lazy } from '@nozbe/watermelondb/decorators';
import Model from '../base';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Tag Schema
 *
 */
export const tagSchema: Schema = {
	name: 'tags',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true, isOptional: true },
		{ name: 'name', type: 'string' },
		{ name: 'slug', type: 'string' },
		{ name: 'parent', type: 'number' },
		{ name: 'description', type: 'string' },
		{ name: 'count', type: 'number' },
	],
};

/**
 * Tag Model
 *
 */
export default class Tag extends Model {
	static table = 'tags';

	static associations = {
		product_tags: { type: 'has_many', foreignKey: 'tag_id' },
	};

	@lazy
	products = this.collections.get('products').query(Q.on('product_tags', 'tag_id', this.id));

	@nochange @field('remote_id') remote_id!: number;
	@field('name') name!: string;
	@field('slug') slug!: string;
	@field('parent') parent!: number;
	@field('description') description!: string;
	@field('count') count!: number;
}
