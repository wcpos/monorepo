import { Q } from '@nozbe/watermelondb';
import { field, nochange, lazy } from '@nozbe/watermelondb/decorators';
import Model from './base';

export default class Category extends Model {
	static table = 'categories';

	static associations = {
		product_categories: { type: 'has_many', foreignKey: 'category_id' },
	};

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
	// @field('image') image!: string;
}
