import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;

/**
 * Product - Category pivot table
 *
 */
export const productCategorySchema: Schema = {
	name: 'product_categories',
	columns: [
		{ name: 'product_id', type: 'string' },
		{ name: 'category_id', type: 'string' },
	],
};

/**
 * Product - Category pivot table
 *
 */
export default class ProductCategory extends Model {
	static table = 'product_categories';

	static associations = {
		products: { type: 'belongs_to', key: 'product_id' },
		categories: { type: 'belongs_to', key: 'category_id' },
	};

	@field('product_id') product_id!: string;
	@field('category_id') category_id!: string;
}
