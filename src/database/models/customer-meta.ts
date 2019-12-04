import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

/**
 * Customer - Meta pivot table
 */
export default class CustomerMeta extends Model {
	static table = 'customer_meta';

	static associations = {
		customers: { type: 'belongs_to', key: 'customer_id' },
		meta: { type: 'belongs_to', key: 'meta_id' },
	};

	@field('customer_id') customer_id!: string;
	@field('meta_id') tag_id!: string;
}
