import {
	field,
	json,
	nochange,
	date,
	immutableRelation,
	relation,
} from '@nozbe/watermelondb/decorators';
import Model from '../base';
import http from '../../../lib/http';
import { children } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;
type Image = typeof import('./image');
type ImageRelation = import('@nozbe/watermelondb').Relation<Image>;

/**
 * Product Variation Schema
 *
 */
export const productVariationSchema: Schema = {
	name: 'product_variations',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'parent_id', type: 'string', isIndexed: true },
		{ name: 'date_created', type: 'string' },
		{ name: 'date_created_gmt', type: 'string' },
		{ name: 'date_modified', type: 'string' },
		{ name: 'date_modified_gmt', type: 'string' },
		{ name: 'description', type: 'string' },
		{ name: 'sku', type: 'string' },
		{ name: 'price', type: 'string' },
		{ name: 'regular_price', type: 'string' },
		{ name: 'sale_price', type: 'string' },
		{ name: 'date_on_sale_from', type: 'string', isOptional: true },
		{ name: 'date_on_sale_from_gmt', type: 'string', isOptional: true },
		{ name: 'date_on_sale_to', type: 'string', isOptional: true },
		{ name: 'date_on_sale_to_gmt', type: 'string', isOptional: true },
		{ name: 'on_sale', type: 'boolean' },
		{ name: 'status', type: 'string' },
		{ name: 'purchasable', type: 'boolean' },
		{ name: 'virtual', type: 'boolean' },
		{ name: 'downloadable', type: 'boolean' },
		{ name: 'downloads', type: 'string' },
		{ name: 'download_limit', type: 'number' },
		{ name: 'download_expiry', type: 'number' },
		{ name: 'tax_status', type: 'string' },
		{ name: 'tax_class', type: 'string' },
		{ name: 'manage_stock', type: 'boolean' },
		{ name: 'stock_quantity', type: 'string', isOptional: true },
		{ name: 'stock_status', type: 'string' },
		{ name: 'backorders', type: 'string' },
		{ name: 'backorders_allowed', type: 'boolean' },
		{ name: 'backordered', type: 'boolean' },
		{ name: 'weight', type: 'string' },
		{ name: 'dimensions', type: 'string' },
		{ name: 'shipping_taxable', type: 'boolean' },
		{ name: 'shipping_class', type: 'string' },
		{ name: 'shipping_class_id', type: 'number' },
		{ name: 'attributes', type: 'string' },
		{ name: 'menu_order', type: 'number' },
		{ name: 'thumbnail', type: 'string' },
		{ name: 'barcode', type: 'string' },
	],
};

/**
 * Product Variation Model
 *
 */
export default class ProductVariation extends Model {
	static table = 'product_variations';

	static associations = {
		products: { type: 'belongs_to', key: 'parent_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
		images: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@immutableRelation('products', 'parent_id') parent!: any;

	@nochange @field('remote_id') remote_id!: number;
	@date('date_created') date_created!: Date;
	@date('date_created_gmt') date_created_gmt!: Date;
	@date('date_modified') date_modified!: Date;
	@date('date_modified_gmt') date_modified_gmt!: Date;
	@field('description') description!: string;
	@field('sku') sku!: string;
	@field('price') price!: string;
	@field('regular_price') regular_price!: string;
	@field('sale_price') sale_price!: string;
	@date('date_on_sale_from') date_on_sale_from!: Date | null;
	@date('date_on_sale_from_gmt') date_on_sale_from_gmt!: Date | null;
	@date('date_on_sale_to') date_on_sale_to!: Date | null;
	@date('date_on_sale_to_gmt') date_on_sale_to_gmt!: Date | null;
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
	@relation('images', 'parent_id') image!: ImageRelation;
	@json('attributes', (json: any[]) => json) attributes!: string;
	@field('menu_order') menu_order!: number;
	@children('meta') meta_data!: MetaDataQuery;
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
