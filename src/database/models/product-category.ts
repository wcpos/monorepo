import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/**
 * Product - Category pivot table
 */
export default class ProductCategory extends Model {
	static table = 'product_categories';

	static associations = {
		products: { type: 'belongs_to', key: 'product_id' },
		categories: { type: 'belongs_to', key: 'category_id' },
	};

	@field('product_id') name!: string;
	@field('category_id') slug!: string;
}
