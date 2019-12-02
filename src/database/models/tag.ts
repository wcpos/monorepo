import { Q } from '@nozbe/watermelondb';
import { field, nochange, lazy } from '@nozbe/watermelondb/decorators';
import Model from './base';

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

	/**
	 *
	 * @param json
	 */
	rawUpdateFromJSON(json) {
		if (!this.remote_id) {
			this.remote_id = json.id;
		}
		this.name = json.name;
		this.slug = json.slug;
	}
}
