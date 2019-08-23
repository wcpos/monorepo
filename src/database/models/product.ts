import { field, date, nochange, json } from '@nozbe/watermelondb/decorators';
import { Associations } from '@nozbe/watermelondb/Model';
import Model from './base';

export default class Product extends Model {
	static table = 'products';

	static associations: Associations = {
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
	@field('categories') categories!: string;
	@field('tags') tags!: string;
	@field('images') images!: string;
	@field('attributes') attributes!: string;
	@field('default_attributes') default_attributes!: string;
	@field('variations') variations!: string;
	@field('grouped_products') grouped_products!: string;
	@field('menu_order') menu_order!: number;
	@json('meta_data', (json: any[]) => json) meta_data!: string;
	@field('thumbnail') thumbnail!: string;
	@field('barcode') barcode!: string;
}
