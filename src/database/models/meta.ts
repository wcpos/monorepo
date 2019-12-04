import { Q } from '@nozbe/watermelondb';
import { field, nochange, lazy } from '@nozbe/watermelondb/decorators';
import Model from './base';

export default class Meta extends Model {
	static table = 'meta';

	static associations = {
		product_meta: { type: 'has_many', foreignKey: 'meta_id' },
		customer_meta: { type: 'has_many', foreignKey: 'meta_id' },
	};

	@lazy
	product = this.collections.get('products').query(Q.on('product_meta', 'meta_id', this.id));

	@lazy
	customer = this.collections.get('customers').query(Q.on('customer_meta', 'meta_id', this.id));

	@nochange @field('remote_id') remote_id!: number;
	@field('key') key!: string;
	@field('value') value!: string;

	/**
	 *
	 * @param json
	 */
	rawUpdateFromJSON(json) {
		if (!this.remote_id) {
			this.remote_id = json.id;
		}
		this.key = json.key;
		this.value = json.value;
	}
}
