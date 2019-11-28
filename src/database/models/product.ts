import { Q } from '@nozbe/watermelondb';
import { field, date, nochange, json, children, lazy } from '@nozbe/watermelondb/decorators';
import difference from 'lodash/difference';
import map from 'lodash/map';
import find from 'lodash/find';
import Model from './base';
import http from '../../lib/http';
import { pivot, meta } from './decorators';

type Associations = import('@nozbe/watermelondb/Model').Associations;
type Query = import('@nozbe/watermelondb').Query<Model>;
type Model = import('@nozbe/watermelondb').Model;

export default class Product extends Model {
	static table = 'products';

	static associations: Associations = {
		product_variations: { type: 'has_many', foreignKey: 'parent_id' },
		product_categories: { type: 'has_many', foreignKey: 'product_id' },
		product_tags: { type: 'has_many', foreignKey: 'product_id' },
		images: { type: 'has_many', foreignKey: 'product_id' },
	};

	@children('product_variations') variations!: any;
	@children('images') images!: any;

	// @lazy
	// categories = this.collections
	// 	.get('categories')
	// 	.query(Q.on('product_categories', 'product_id', this.id));
	@pivot('categories', 'product_categories') categories: Query<Model>;

	@lazy
	tags = this.collections.get('tags').query(Q.on('product_tags', 'product_id', this.id));

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
	// @field('categories') categories!: string;
	// @field('tags') tags!: string;
	// @field('images') images!: string;
	@field('attributes') attributes!: string;
	@field('default_attributes') default_attributes!: string;
	// @field('variations') variations!: string;
	@field('grouped_products') grouped_products!: string;
	@field('menu_order') menu_order!: number;
	// @meta('product_meta') meta_data!: [];
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
			await this.update(product => {
				this.updateVariations(response.data.variations);
				// this.updateCategories(response.data.categories);
				this.updateTags(response.data.tags);
				this.updateImages(response.data.images);
				delete response.data.id;
				delete response.data.variations;
				// delete response.data.categories;
				delete response.data.tags;
				delete response.data.images;
				this.updateFromJSON(response.data);
			});
		});
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
	 * @TODO - remove cats from pivot table if required
	 */
	async updateCategories(categories) {
		const existingCategories = await this.collections
			.get('categories')
			.query()
			.fetch();
		const existingCategoryIds = map(existingCategories, 'remote_id');

		const addCategories = categories.filter(category => {
			return !existingCategoryIds.includes(category.id);
		});

		const add = addCategories.map(category =>
			this.categories.collection.prepareCreate((model: any) => {
				model.remote_id = category.id;
				model.name = category.name;
				model.slug = category.slug;
			})
		);

		const pivot = add.map(category =>
			this.collections.get('product_categories').prepareCreate((model: any) => {
				model.category_id = category.id;
				model.product_id = this.id;
			})
		);

		// @TODO: remove from pivot table

		return await this.batch(...add, ...pivot);
	}

	/**
	 * @TODO - remove tags from pivot table if required
	 */
	async updateTags(tags) {
		const existingTags = await this.collections
			.get('tags')
			.query()
			.fetch();
		const existingTagIds = map(existingTags, 'remote_id');

		const addTags = tags.filter(tag => {
			return !existingTagIds.includes(tag.id);
		});

		const add = addTags.map(tag =>
			this.tags.collection.prepareCreate((model: any) => {
				model.remote_id = tag.id;
				model.name = tag.name;
				model.slug = tag.slug;
			})
		);

		const pivot = add.map(tag =>
			this.collections.get('product_tags').prepareCreate((model: any) => {
				model.tag_id = tag.id;
				model.product_id = this.id;
			})
		);

		// @TODO: remove from pivot table

		return await this.batch(...add, ...pivot);
	}

	/**
	 *
	 */
	async toJSON() {
		const json = super.toJSON();
		const categories = await this.categories.fetch();
		const tags = await this.tags.fetch();
		json.categories = categories.map(category => category.toJSON());
		json.tags = tags.map(tag => tag.toJSON());
		console.log(json);
		return json;
	}
}
