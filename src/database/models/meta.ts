import { Q } from '@nozbe/watermelondb';
import { field, nochange, lazy } from '@nozbe/watermelondb/decorators';
import Model from './base';

export default class Tag extends Model {
	static table = 'meta';

	static associations = {
		product_meta: { type: 'has_many', foreignKey: 'meta_id' },
	};

	@lazy
	products = this.collections.get('products').query(Q.on('product_meta', 'meta_id', this.id));

	@nochange @field('remote_id') remote_id!: number;
	@field('key') key!: string;
	@field('value') value!: string;
}
