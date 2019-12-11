import { Q } from '@nozbe/watermelondb';
import { field, nochange, json, lazy } from '@nozbe/watermelondb/decorators';
import difference from 'lodash/difference';
import map from 'lodash/map';
import find from 'lodash/find';
import Model from '../base';
import http from '../../../lib/http';
import { pivot, date, children } from '../decorators';

type AssociationsType = import('@nozbe/watermelondb/Model').Associations;
type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;
type Image = typeof import('./image');
type ImageQuery = import('@nozbe/watermelondb').Query<Image>;
type ProductAttribute = typeof import('./product-attribute');
type ProductAttributeQuery = import('@nozbe/watermelondb').Query<ProductAttribute>;
type ProductCategory = typeof import('./product-category');
type ProductCategoryQuery = import('@nozbe/watermelondb').Query<ProductCategory>;
type ProductTag = typeof import('./product-tag');
type ProductTagQuery = import('@nozbe/watermelondb').Query<ProductTag>;
type ProductVariation = typeof import('./product-variation');
type ProductVariationQuery = import('@nozbe/watermelondb').Query<ProductVariation>;

/**
 * Product Schema
 *
 */
export const productSchema: Schema = {
	name: 'products',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true },
		{ name: 'name', type: 'string' },
		{ name: 'slug', type: 'string' },
		{ name: 'permalink', type: 'string' },
		{ name: 'date_created', type: 'string' },
		{ name: 'date_created_gmt', type: 'string' },
		{ name: 'date_modified', type: 'string' },
		{ name: 'date_modified_gmt', type: 'string' },
		{ name: 'type', type: 'string' },
		{ name: 'status', type: 'string' },
		{ name: 'featured', type: 'boolean' },
		{ name: 'catalog_visibility', type: 'string' },
		{ name: 'description', type: 'string' },
		{ name: 'short_description', type: 'string' },
		{ name: 'sku', type: 'string' },
		{ name: 'price', type: 'string' },
		{ name: 'regular_price', type: 'string' },
		{ name: 'sale_price', type: 'string' },
		{ name: 'date_on_sale_from', type: 'string', isOptional: true },
		{ name: 'date_on_sale_from_gmt', type: 'string', isOptional: true },
		{ name: 'date_on_sale_to', type: 'string', isOptional: true },
		{ name: 'date_on_sale_to_gmt', type: 'string', isOptional: true },
		{ name: 'price_html', type: 'string' },
		{ name: 'on_sale', type: 'boolean' },
		{ name: 'purchasable', type: 'boolean' },
		{ name: 'total_sales', type: 'number' },
		{ name: 'virtual', type: 'boolean' },
		{ name: 'downloadable', type: 'boolean' },
		{ name: 'downloads', type: 'string' },
		{ name: 'download_limit', type: 'number' },
		{ name: 'download_expiry', type: 'number' },
		{ name: 'external_url', type: 'string' },
		{ name: 'button_text', type: 'string' },
		{ name: 'tax_status', type: 'string' },
		{ name: 'tax_class', type: 'string' },
		{ name: 'manage_stock', type: 'boolean' },
		{ name: 'stock_quantity', type: 'string', isOptional: true },
		{ name: 'stock_status', type: 'string' },
		{ name: 'backorders', type: 'string' },
		{ name: 'backorders_allowed', type: 'boolean' },
		{ name: 'backordered', type: 'boolean' },
		{ name: 'sold_individually', type: 'boolean' },
		{ name: 'weight', type: 'string' },
		{ name: 'dimensions', type: 'string' },
		{ name: 'shipping_required', type: 'boolean' },
		{ name: 'shipping_taxable', type: 'boolean' },
		{ name: 'shipping_class', type: 'string' },
		{ name: 'shipping_class_id', type: 'number' },
		{ name: 'reviews_allowed', type: 'boolean' },
		{ name: 'average_rating', type: 'string' },
		{ name: 'rating_count', type: 'number' },
		{ name: 'related_ids', type: 'string' },
		{ name: 'upsell_ids', type: 'string' },
		{ name: 'cross_sell_ids', type: 'string' },
		{ name: 'parent_id', type: 'number' },
		{ name: 'purchase_note', type: 'string' },
		{ name: 'images', type: 'string' },
		{ name: 'grouped_products', type: 'string' },
		{ name: 'menu_order', type: 'number' },
		{ name: 'thumbnail', type: 'string' },
		{ name: 'barcode', type: 'string' },
	],
};

/**
 * Product Model
 *
 */
export default class Product extends Model {
	static table = 'products';

	static associations: AssociationsType = {
		images: { type: 'has_many', foreignKey: 'parent_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
		product_attributes: { type: 'has_many', foreignKey: 'product_id' },
		product_categories: { type: 'has_many', foreignKey: 'product_id' },
		product_tags: { type: 'has_many', foreignKey: 'product_id' },
		product_variations: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id!: number;
	@field('name') name!: string;
	@field('slug') slug!: string;
	@field('permalink') permalink!: string;
	@date('date_created') date_created!: string;
	@date('date_created_gmt') date_created_gmt!: string;
	@date('date_modified') date_modified!: string;
	@date('date_modified_gmt') date_modified_gmt!: string;
	@field('type') type!: string;
	@field('status') status!: string;
	@field('featured') featured!: boolean;
	@field('catalog_visibility') catalog_visibility!: string;
	@field('description') description!: string;
	@field('short_description') short_description!: string;
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
	@field('purchasable') purchasable!: string;
	@field('total_sales') total_sales!: number;
	@field('virtual') virtual!: boolean;
	@field('downloadable') downloadable!: boolean;
	@field('downloads') downloads!: string;
	@field('download_limit') download_limit!: number;
	@field('download_expiry') download_expiry!: number;
	@field('external_url') external_url!: string;
	@field('button_text') button_text!: string;
	@field('tax_status') tax_status!: string;
	@field('tax_class') tax_class!: string;
	@field('manage_stock') manage_stock!: boolean;
	@field('stock_quantity') stock_quantity!: number | null;
	@field('stock_status') in_stock!: string;
	@field('backorders') backorders!: string;
	@field('backorders_allowed') backorders_allowed!: boolean;
	@field('backordered') backordered!: boolean;
	@field('sold_individually') sold_individually!: boolean;
	@field('weight') weight!: string;
	@field('dimensions') dimensions!: string;
	@field('shipping_required') shipping_required!: boolean;
	@field('shipping_taxable') shipping_taxable!: boolean;
	@field('shipping_class') shipping_class!: string;
	@field('shipping_class_id') shipping_class_id!: number;
	@field('reviews_allowed') reviews_allowed!: boolean;
	@field('average_rating') average_rating!: string;
	@field('rating_count') rating_count!: number;
	@field('related_ids') related_ids!: string;
	@field('upsell_ids') upsell_ids!: string;
	@field('cross_sell_ids') cross_sell_ids!: string;
	@field('parent_id') parent_id!: number;
	@field('purchase_note') purchase_note!: string;
	@pivot('categories', 'product_categories') categories!: ProductCategoryQuery;
	@pivot('tags', 'product_tags') tags!: ProductTagQuery;
	@children('images') images!: ImageQuery;
	@pivot('attributes', 'product_attributes') attributes!: ProductAttributeQuery;
	@field('default_attributes') default_attributes!: string;
	@children('product_variations') variations!: ProductVariationQuery;
	@field('grouped_products') grouped_products!: string;
	@field('menu_order') menu_order!: number;
	@children('meta') meta_data!: MetaDataQuery;
	@field('thumbnail') thumbnail!: string;
	@field('barcode') barcode!: string;

	/**
	 *
	 */
	isVariable() {
		return this.type === 'variable';
	}

	/**
	 *
	 */
	async fetch() {
		const response = await http(
			'https://dev.local/wp/latest/wp-json/wc/v3/products/' + this.remote_id,
			{
				auth: {
					username: 'ck_c0cba49ee21a37ef95d915e03631c7afd53bc8df',
					password: 'cs_6769030f21591d37cd91e5983ebe532521fa875a',
				},
			}
		);

		await this.database.action(async () => {
			await this.update(response.data);
		});
	}

	/**
	 *
	 */
	setVariations(data) {
		debugger;
	}

	/**
	 *
	 */
	setImages(data) {
		debugger;
	}

	/**
	 *
	 */
	async updateVariations(variationIds: []) {
		// get existing variation ids
		const existingVariations = await this.variations.fetch();
		const existingVariationIds = map(existingVariations, 'remote_id');
		const addVariationIds = difference(variationIds, existingVariationIds);
		const deleteVariationIds = difference(existingVariationIds, variationIds);

		const add = addVariationIds.map(variationId =>
			this.variations.collection.prepareCreate((model: any) => {
				model.parent.set(this);
				model.remote_id = variationId;
				model.parent_id = this.remote_id;
			})
		);

		const del = deleteVariationIds.map(variationId =>
			find(existingVariations, { remote_id: variationId }).prepareDestroyPermanently()
		);

		return await this.batch(...add, ...del);
	}

	/**
	 *
	 */
	async updateImages(images: []) {
		// get existing variation ids
		const existingImages = await this.images.fetch();
		// const existingVariationIds = map(existingVariations, 'remote_id');
		// const addVariationIds = difference(variationIds, existingVariationIds);
		// const deleteVariationIds = difference(existingVariationIds, variationIds);

		const add = images.map(image =>
			this.images.collection.prepareCreate((model: any) => {
				model.product.set(this);
			})
		);

		// const del = deleteVariationIds.map(variationId =>
		// 	find(existingVariations, { remote_id: variationId }).prepareDestroyPermanently()
		// );

		return await this.batch(...add);
	}

	/**
	 *
	 */
	async toJSON() {
		const json = super.toJSON();
		const attributes = await this.attributes.fetch();
		const categories = await this.categories.fetch();
		const tags = await this.tags.fetch();
		json.attributes = attributes.map(attribute => attribute.toJSON());
		json.categories = categories.map(category => category.toJSON());
		json.tags = tags.map(tag => tag.toJSON());
		console.log(json);
		return json;
	}
}
