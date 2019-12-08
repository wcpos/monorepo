import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/**
 * Product - Attribute pivot table
 */
export default class ProductAttribute extends Model {
	static table = 'product_attributes';

	static associations = {
		products: { type: 'belongs_to', key: 'product_id' },
		attributes: { type: 'belongs_to', key: 'attribute_id' },
	};

	@field('product_id') product_id!: string;
	@field('attribute_id') attribute_id!: string;
}
