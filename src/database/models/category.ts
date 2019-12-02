import { Q } from '@nozbe/watermelondb';
import { field, nochange, lazy, relation } from '@nozbe/watermelondb/decorators';
import Model from './base';

export default class Category extends Model {
	static table = 'categories';

	static associations = {
		product_categories: { type: 'has_many', foreignKey: 'category_id' },
	};

	@relation('images', 'image_id') image!: any;

	@lazy
	products = this.collections
		.get('products')
		.query(Q.on('product_categories', 'category_id', this.id));

	@nochange @field('remote_id') remote_id!: number;
	@field('name') name!: string;
	@field('slug') slug!: string;
	@field('parent') parent!: number;
	@field('description') description!: string;
	@field('display') display!: string;
	@field('menu_order') menu_order!: number;
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
