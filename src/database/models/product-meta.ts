import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/**
 * Product - Tag pivot table
 */
export default class ProductMeta extends Model {
	static table = 'product_meta';

	static associations = {
		products: { type: 'belongs_to', key: 'product_id' },
		meta: { type: 'belongs_to', key: 'meta_id' },
	};

	@field('product_id') product_id!: string;
	@field('meta_id') tag_id!: string;
}
