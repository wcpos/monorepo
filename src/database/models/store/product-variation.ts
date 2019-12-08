import {
	field,
	json,
	nochange,
	date,
	immutableRelation,
	lazy,
} from '@nozbe/watermelondb/decorators';
import { distinctUntilChanged, distinctUntilKeyChanged, switchMap } from 'rxjs/operators';
import Model from '../base';
import http from '../../../lib/http';
import { children } from '../decorators';

export default class ProductVariation extends Model {
	static table = 'product_variations';

	static associations = {
		products: { type: 'belongs_to', key: 'parent_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
		images: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@immutableRelation('products', 'parent_id') parent!: any;

	@nochange @field('remote_id') remote_id!: number;
	@date('date_created') date_created!: string;
	@date('date_created_gmt') date_created_gmt!: string;
	@date('date_modified') date_modified!: string;
	@date('date_modified_gmt') date_modified_gmt!: string;
	@field('description') description!: string;
	@field('sku') sku!: string;
	@field('price') price!: string;
	@field('regular_price') regular_price!: string;
	@field('sale_price') sale_price!: string;
	@date('date_on_sale_from') date_on_sale_from!: string | null;
	@date('date_on_sale_from_gmt') date_on_sale_from_gmt!: string | null;
	@date('date_on_sale_to') date_on_sale_to!: string | null;
	@date('date_on_sale_to_gmt') date_on_sale_to_gmt!: string | null;
	@field('price_html') price_html!: string;
	@field('on_sale') on_sale!: string;
	@field('status') status!: string;
	@field('purchasable') purchasable!: string;
	@field('virtual') virtual!: boolean;
	@field('downloadable') downloadable!: boolean;
	@field('downloads') downloads!: string;
	@field('download_limit') download_limit!: number;
	@field('download_expiry') download_expiry!: number;
	@field('tax_status') tax_status!: string;
	@field('tax_class') tax_class!: string;
	@field('manage_stock') manage_stock!: boolean;
	@field('stock_quantity') stock_quantity!: number | null;
	@field('stock_status') in_stock!: string;
	@field('backorders') backorders!: string;
	@field('backorders_allowed') backorders_allowed!: boolean;
	@field('backordered') backordered!: boolean;
	@field('weight') weight!: string;
	@field('dimensions') dimensions!: string;
	@field('shipping_class') shipping_class!: string;
	@field('shipping_class_id') shipping_class_id!: number;
	@children('images') images!: string;
	@json('attributes', (json: any[]) => json) attributes!: string;
	@field('menu_order') menu_order!: number;
	@children('meta') meta_data!: [];
	@field('thumbnail') thumbnail!: string;
	@field('barcode') barcode!: string;

	/**
	 *
	 */
	async fetch() {
		const parent = await this.parent.fetch();

		const response = await http(
			'https://dev.local/wp/latest/wp-json/wc/v3/products/' +
				parent.remote_id +
				'/variations/' +
				this.remote_id,
			{
				auth: {
					username: 'ck_c0cba49ee21a37ef95d915e03631c7afd53bc8df',
					password: 'cs_6769030f21591d37cd91e5983ebe532521fa875a',
				},
			}
		);

		await this.database.action(async () => {
			await this.update(variation => {
				this.updateFromJSON(response.data);
			});
		});
	}
}
