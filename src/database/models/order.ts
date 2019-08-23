import { Q } from '@nozbe/watermelondb';
import { field, nochange, date, json, action, children } from '@nozbe/watermelondb/decorators';
import Model from './base';

type BillingProps = import('./types').BillingProps;
type ShippingProps = import('./types').ShippingProps;
type Product = typeof import('./product');
type OrderLineItem = typeof import('./order-line-item');

const sanitizeValues = (json: any) => json || {};

class Order extends Model {
	static table = 'orders';

	static associations = {
		order_line_items: { type: 'has_many', foreignKey: 'order_id' },
	};

	@children('order_line_items') line_items!: any;

	@nochange @field('remote_id') remote_id!: number;
	@field('parent_id') parent_id!: number;
	@field('number') number!: string;
	@field('order_key') order_key!: string;
	@field('created_via') created_via!: string;
	@field('version') version!: string;
	@field('status') status!: string;
	@field('currency') currency!: string;
	@field('date_created') date_created!: string;
	@date('date_created_gmt') date_created_gmt!: string;
	@date('date_modified') date_modified!: string;
	@date('date_modified_gmt') date_modified_gmt!: string;
	@field('discount_total') discount_total!: string;
	@field('discount_tax') discount_tax!: string;
	@field('shipping_total') shipping_total!: string;
	@field('shipping_tax') shipping_tax!: string;
	@field('cart_tax') cart_tax!: string;
	@field('total') total!: string;
	@field('total_tax') total_tax!: string;
	@field('prices_include_tax') prices_include_tax!: boolean;
	@field('customer_id') customer_id!: string;
	@field('customer_ip_address') customer_ip_address!: string;
	@field('customer_user_agent') customer_user_agent!: string;
	@field('customer_note') customer_note!: string;
	@json('billing', sanitizeValues) billing!: BillingProps;
	@json('shipping', sanitizeValues) shipping!: ShippingProps;
	@field('payment_method') payment_method!: string;
	@field('payment_method_title') payment_method_title!: string;
	@field('transaction_id') transaction_id!: string;
	@date('date_paid') date_paid!: string;
	@date('date_paid_gmt') date_paid_gmt!: string;
	@date('date_completed') date_completed!: string;
	@date('date_completed_gmt') date_completed_gmt!: string;
	@field('cart_hash') cart_hash!: string;
	@json('meta_data', sanitizeValues) meta_data!: string;
	// @json('line_items', (json: any) => json) line_items!: string;
	@json('tax_lines', sanitizeValues) tax_lines!: string;
	@json('shipping_lines', sanitizeValues) shipping_lines!: string;
	@json('fee_lines', sanitizeValues) fee_lines!: string;
	@json('coupon_lines', sanitizeValues) coupon_lines!: string;
	@json('refunds', sanitizeValues) refunds!: string;

	/** */
	get customerName() {
		return this.billing.first_name + ' ' + this.billing.last_name;
	}

	/** */
	async setCustomer(customer: any) {
		await this.update(() => {
			this.customer_id = customer.remote_id;
			this.billing = customer.billing;
			this.shipping = customer.shipping;
		});
	}

	/** */
	async updateFromJSON(json: any) {
		await this.update(() => {
			Object.keys(json).forEach((key: string) => {
				// @ts-ignore
				this[key] = json[key];
			});
		});
	}

	/** */
	@action async addToCart(product: Product) {
		this.logger.info('Add to cart: ' + product.name, { meta: product });

		// check if product already in cart
		const rows = await this.line_items.extend(Q.where('product_id', product.remote_id)).fetch();

		// update exiting or create new
		await this.subAction(() => {
			if (rows.length === 1) {
				return rows[0].update((item: OrderLineItem) => {
					item.quantity = item.quantity + 1;
				});
			} else {
				return this.createLineItem(product);
			}
		});
	}

	/**
	 *
	 */
	@action async createLineItem(product: Product) {
		const line_item = await this.line_items.collection.create((item: OrderLineItem) => {
			item.order.set(this);
			item.quantity = 1;
			item.name = product.name;
			item.product_id = product.remote_id;
			// item.variation_id = product.variation_id;
			item.tax_class = product.tax_class;
			item.meta_data = product.meta_data;
			item.sku = product.sku;
			item.price = parseFloat(product.price);
		});
		this.logger.info('New line_item created', { meta: line_item });
		return line_item;
	}

	/**
	 *
	 */
	@action async createOrder(data: any) {
		this.remote_id = data.id;
		this.number = data.number;
	}

	/**
	 *
	 */
	@action async createLineItems(line_items: any[]) {
		const batch = line_items.map((item: any) => {
			return this.line_items.collection.prepareCreate((model: OrderLineItem) => {
				model.order.set(this);
				model.quantity = 1;
				model.name = item.name;
				model.product_id = item.product_id;
				// item.variation_id = product.variation_id;
				model.tax_class = item.tax_class;
				model.meta_data = item.meta_data;
				model.sku = item.sku;
				model.price = parseFloat(item.price);
			});
		});
		// @ts-ignore
		await this.batch(batch);
	}

	async destroyPermanently() {
		await this.line_items.destroyAllPermanently();
		await super.destroyPermanently();
	}

	/**
	 *
	 */
	async calculatedTotal() {
		const value = await this.line_items.fetch();
		debugger;
		return value;
	}
}

export default Order;
