import { Q } from '@nozbe/watermelondb';
import { field, nochange, date, action } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import http from '../../../lib/http';
import { address, children } from '../decorators';

type Query = typeof import('@nozbe/watermelondb/Query');

export interface OrderInterface {
	remote_id: number;
	parent_id: number;
	number: string;
	order_key: string;
	created_via: string;
	version: string;
	status: string;
	currency: string;
	date_created: string;
	date_created_gmt: string;
	date_modified: string;
	date_modified_gmt: string;
	discount_total: string;
	discount_tax: string;
	shipping_total: string;
	shipping_tax: string;
	cart_tax: string;
	total: string;
	total_tax: string;
	prices_include_tax: boolean;
	customer_id: string;
	customer_ip_address: string;
	customer_user_agent: string;
	customer_note: string;
	billing: typeof import('./address');
	shipping: typeof import('./address');
	payment_method: string;
	payment_method_title: string;
	transaction_id: string;
	date_paid: string;
	date_paid_gmt: string;
	date_completed: string;
	date_completed_gmt: string;
	cart_hash: string;
	meta_data: import('./meta').MetaDataInterface[];
	line_items: import('./line-item').LineItemInterface[];
	tax_lines: import('./tax').TaxInterface[];
	shipping_lines: import('./shipping-line').ShippingLineInterface[];
	fee_lines: import('./fee-line').FeeLineInterface[];
	coupon_lines: import('./coupon-line').CouponLineInterface[];
	refunds: Query<typeof import('./refund')>;
}

class Order extends Model implements OrderInterface {
	static table = 'orders';

	static associations = {
		line_items: { type: 'has_many', foreignKey: 'order_id' },
		taxes: { type: 'has_many', foreignKey: 'parent_id' },
		shipping_lines: { type: 'has_many', foreignKey: 'order_id' },
		fee_lines: { type: 'has_many', foreignKey: 'order_id' },
		coupon_lines: { type: 'has_many', foreignKey: 'order_id' },
		refunds: { type: 'has_many', foreignKey: 'order_id' },
		meta: { type: 'has_many', foreignKey: 'parent_id' },
	};

	@nochange @field('remote_id') remote_id;
	@field('parent_id') parent_id;
	@field('number') number;
	@field('order_key') order_key;
	@field('created_via') created_via;
	@field('version') version;
	@field('status') status;
	@field('currency') currency;
	@field('date_created') date_created;
	@date('date_created_gmt') date_created_gmt;
	@date('date_modified') date_modified;
	@date('date_modified_gmt') date_modified_gmt;
	@field('discount_total') discount_total;
	@field('discount_tax') discount_tax;
	@field('shipping_total') shipping_total;
	@field('shipping_tax') shipping_tax;
	@field('cart_tax') cart_tax;
	@field('total') total;
	@field('total_tax') total_tax;
	@field('prices_include_tax') prices_include_tax;
	@field('customer_id') customer_id;
	@field('customer_ip_address') customer_ip_address;
	@field('customer_user_agent') customer_user_agent;
	@field('customer_note') customer_note;
	@address('addresses', 'billing_id') billing;
	@address('addresses', 'shipping_id') shipping;
	@field('payment_method') payment_method;
	@field('payment_method_title') payment_method_title;
	@field('transaction_id') transaction_id;
	@date('date_paid') date_paid;
	@date('date_paid_gmt') date_paid_gmt;
	@date('date_completed') date_completed;
	@date('date_completed_gmt') date_completed_gmt;
	@field('cart_hash') cart_hash;
	@children('meta') meta_data;
	@children('line_items') line_items;
	@children('taxes') tax_lines;
	@children('shipping_lines') shipping_lines;
	@children('fee_lines') fee_lines;
	@children('coupon_lines') coupon_lines;
	@children('refunds') refunds;

	/** */
	get customerName() {
		return this.billing.first_name + ' ' + this.billing.last_name;
	}

	/** */
	async setCustomer(customer: any) {
		debugger;
		await this.update(() => {
			this.customer_id = customer.remote_id;
			this.billing = customer.billing;
			this.shipping = customer.shipping;
		});
	}

	/** */
	async setLineItems(array: []) {
		// reconcile??

		const batch = array.map((json: any) => {
			return this.line_items.collection.prepareCreate((m: OrderLineItem) => {
				m.order.set(this);
				m.set(json);
			});
		});
		await this.batch(batch);
	}

	/** */
	async setMetaData(array: []) {
		debugger;
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
		let name = product.name;
		// if variable, get name from parent
		if (product.constructor.name === 'ProductVariation') {
			const parent = await product.parent.fetch();
			name = parent.name;
		}
		const line_item = await this.line_items.collection.create((item: OrderLineItem) => {
			item.order.set(this);
			item.quantity = 1;
			item.name = name;
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

	/**
	 *
	 */
	async fetch() {
		const response = await http(
			'https://dev.local/wp/latest/wp-json/wc/v3/orders/' + this.remote_id,
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
}

export default Order;
