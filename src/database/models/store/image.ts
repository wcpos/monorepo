import { Model } from '@nozbe/watermelondb';
import { field, nochange, date, immutableRelation } from '@nozbe/watermelondb/decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Image Schema
 *
 */
export const imageSchema: Schema = {
	name: 'images',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'parent_id', type: 'string', isIndexed: true },
		{ name: 'date_created', type: 'string' },
		{ name: 'date_created_gmt', type: 'string' },
		{ name: 'date_modified', type: 'string' },
		{ name: 'date_modified_gmt', type: 'string' },
		{ name: 'src', type: 'string' },
		{ name: 'name', type: 'string' },
		{ name: 'alt', type: 'string' },
	],
};

/**
 * Image Model
 *
 */
export default class Image extends Model {
	static table = 'images';

	static associations = {
		products: { type: 'belongs_to', key: 'parent_id' },
	};

	@immutableRelation('products', 'parent_id') product!: any;

	@nochange @field('remote_id') remote_id!: number;
	@date('date_created') date_created!: Date;
	@date('date_created_gmt') date_created_gmt!: Date;
	@date('date_modified') date_modified!: Date;
	@date('date_modified_gmt') date_modified_gmt!: Date;
	@field('src') description!: string;
	@field('name') name!: string;
	@field('alt') slug!: string;
}
