import { Q } from '@nozbe/watermelondb';
import { field, nochange, action, lazy } from '@nozbe/watermelondb/decorators';
import Model from '../base';
import http from '../../../lib/http';
import { address, children, date } from '../decorators';

type Schema = import('@nozbe/watermelondb/Schema').TableSchemaSpec;
type MetaData = typeof import('./meta');
type MetaDataQuery = import('@nozbe/watermelondb').Query<MetaData>;
type LineItem = typeof import('./line-item');
type LineItemQuery = import('@nozbe/watermelondb').Query<LineItem>;
type Tax = typeof import('./tax');
type TaxQuery = import('@nozbe/watermelondb').Query<Tax>;
type ShippingLine = typeof import('./shipping-line');
type ShippingLineQuery = import('@nozbe/watermelondb').Query<ShippingLine>;
type FeeLine = typeof import('./fee-line');
type FeeLineQuery = import('@nozbe/watermelondb').Query<FeeLine>;
type CouponLine = typeof import('./coupon-line');
type CouponLineQuery = import('@nozbe/watermelondb').Query<CouponLine>;
type OrderRefund = typeof import('./refund');
type OrderRefundQuery = import('@nozbe/watermelondb').Query<OrderRefund>;

/**
 * Order Schema
 *
 */
export const orderSchema: Schema = {
	name: 'orders',
	columns: [
		{ name: 'remote_id', type: 'number', isIndexed: true, isOptional: true },
		{ name: 'parent_id', type: 'number' },
		{ name: 'number', type: 'string' },
		{ name: 'order_key', type: 'string' },
		{ name: 'created_via', type: 'string' },
		{ name: 'version', type: 'string' },
		{ name: 'status', type: 'string' },
		{ name: 'currency', type: 'string' },
		{ name: 'date_created', type: 'string' },
		{ name: 'date_created_gmt', type: 'string' },
		{ name: 'date_modified', type: 'string' },
		{ name: 'date_modified_gmt', type: 'string' },
		{ name: 'discount_total', type: 'string' },
		{ name: 'discount_tax', type: 'string' },
		{ name: 'shipping_total', type: 'string' },
		{ name: 'shipping_tax', type: 'string' },
		{ name: 'cart_tax', type: 'string' },
		{ name: 'total', type: 'string' },
		{ name: 'total_tax', type: 'string' },
		{ name: 'prices_include_tax', type: 'boolean' },
		{ name: 'customer_id', type: 'number' },
		{ name: 'customer_ip_address', type: 'string' },
		{ name: 'customer_user_agent', type: 'string' },
		{ name: 'customer_note', type: 'string' },
		{ name: 'payment_method', type: 'string' },
		{ name: 'payment_method_title', type: 'string' },
		{ name: 'transaction_id', type: 'string' },
		{ name: 'date_paid', type: 'string' },
		{ name: 'date_paid_gmt', type: 'string' },
		{ name: 'date_completed', type: 'string', isOptional: true },
		{ name: 'date_completed_gmt', type: 'string', isOptional: true },
		{ name: 'cart_hash', type: 'string' },
		{ name: 'set_paid', type: 'boolean' },

		{ name: 'billing_id', type: 'string' },
		{ name: 'shipping_id', type: 'string' },
	],
};

/**
 * Order Model
 *
 */
class Order extends Model {
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

	@lazy
	customer = this.collections.get('customers').query(Q.where('remote_id', this.customer_id));

	@nochange @field('remote_id') remote_id!: number;
	@field('parent_id') parent_id!: number;
	@field('number') number!: string;
	@field('order_key') order_key!: string;
	@field('created_via') created_via!: string;
	@field('version') version!: string;
	@field('status') status!: string;
	@field('currency') currency!: string;
	@date('date_created') date_created!: Date;
	@date('date_created_gmt') date_created_gmt!: Date;
	@date('date_modified') date_modified!: Date;
	@date('date_modified_gmt') date_modified_gmt!: Date;
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
	@address('addresses', 'billing_id') billing!: string;
	@address('addresses', 'shipping_id') shipping!: string;
	@field('payment_method') payment_method!: string;
	@field('payment_method_title') payment_method_title!: string;
	@field('transaction_id') transaction_id!: string;
	@date('date_paid') date_paid!: Date;
	@date('date_paid_gmt') date_paid_gmt!: Date;
	@date('date_completed') date_completed!: Date;
	@date('date_completed_gmt') date_completed_gmt!: Date;
	@field('cart_hash') cart_hash!: string;
	@children('meta') meta_data!: MetaDataQuery;
	@children('line_items') line_items!: LineItemQuery;
	@children('taxes') tax_lines!: TaxQuery;
	@children('shipping_lines') shipping_lines!: ShippingLineQuery;
	@children('fee_lines') fee_lines!: FeeLineQuery;
	@children('coupon_lines') coupon_lines!: CouponLineQuery;
	@children('refunds') refunds!: OrderRefundQuery;

	/** */
	async setCustomer(customer: any) {
		debugger;
		await this.update(() => {
			this.customer_id = customer.remote_id;
			this.billing = customer.billing;
			this.shipping = customer.shipping;
		});
	}

	setChildren(array: [], key: string) {
		const add = array.map((json: any) => {
			return this[key].collection.prepareCreate((m: OrderLineItem) => {
				m.order.set(this);
				m.set(json);
			});
		});
		return this.batch(...add);
	}

	/** */
	async setLineItems(array: []) {
		// reconcile??

		const add = array.map((json: any) => {
			return this.line_items.collection.prepareCreate((m: OrderLineItem) => {
				m.order.set(this);
				m.set(json);
			});
		});
		await this.batch(...add);
	}

	setTaxLines(array: []) {
		this.setChildren(array, 'tax_lines');
	}

	setShippingLines(array: []) {
		this.setChildren(array, 'shipping_lines');
	}

	setFeeLines(array: []) {
		this.setChildren(array, 'fee_lines');
	}

	setCouponLines(array: []) {
		this.setChildren(array, 'coupon_lines');
	}

	setRefunds(array: []) {
		this.setChildren(array, 'refunds');
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

	/**
	 *
	 */
	async toJSON() {
		const json = super.toJSON();
		const billing = await this.billing.fetch();
		const shipping = await this.shipping.fetch();
		const line_items = await this.line_items.fetch();
		const meta = await this.meta_data.fetch();
		json.billing = billing.toJSON();
		json.shipping = shipping.toJSON();
		json.line_items = line_items.map(line_item => line_item.toJSON());
		json.meta_data = meta.map(m => m.toJSON());
		return json;
	}
}

export default Order;
