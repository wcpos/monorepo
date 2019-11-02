import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/**
 * Product - Tag pivot table
 */
export default class ProductTag extends Model {
	static table = 'product_tags';

	static associations = {
		products: { type: 'belongs_to', key: 'product_id' },
		categories: { type: 'belongs_to', key: 'tag_id' },
	};

	@field('product_id') product_id!: string;
	@field('tag_id') tag_id!: string;
}
