import database from '../database';
import { sync } from './';
import Order from '../models/order/model';

const orderCollection = database.collections.get('orders');

export const batchAddOrders = async (data: any[]) => {
	const batch: any[] = [];
	data.map((data: any) => {
		const newOrder = orderCollection.prepareCreate((order: Order) => {
			order.remote_id = data.id;
			order.parent_id = data.parent_id;
			order.number = data.number;
			order.order_key = data.order_key;
			order.created_via = data.created_via;
			order.version = data.version;
			order.status = data.status;
			order.currency = data.currency;
			order.date_created = data.date_created;
			order.date_created_gmt = data.date_created_gmt;
			order.date_modified = data.date_modified;
			order.date_modified_gmt = data.date_modified_gmt;
			order.discount_total = data.discount_total;
			order.discount_tax = data.discount_tax;
			order.shipping_total = data.shipping_total;
			order.shipping_tax = data.shipping_tax;
			order.cart_tax = data.cart_tax;
			order.total = data.total;
			order.total_tax = data.total_tax;
			order.prices_include_tax = data.prices_include_tax;
			order.customer_id = data.customer_id;
			order.customer_ip_address = data.customer_ip_address;
			order.customer_user_agent = data.customer_user_agent;
			order.customer_note = data.customer_note;
			order.billing = data.billing;
			order.shipping = data.shipping;
			order.payment_method = data.payment_method;
			order.payment_method_title = data.payment_method_title;
			order.transaction_id = data.transaction_id;
			order.date_paid = data.date_paid;
			order.date_paid_gmt = data.date_paid_gmt;
			order.date_completed = data.date_completed;
			order.date_completed_gmt = data.date_completed_gmt;
			order.cart_hash = data.cart_hash;
			order.meta_data = data.meta_data;
			order.tax_lines = data.tax_lines;
			order.shipping_lines = data.shipping_lines;
			order.fee_lines = data.fee_lines;
			order.coupon_lines = data.coupon_lines;
			order.refunds = data.refunds;
		});
		// const line_items = newOrder.createLineItems(data.line_items);
		const line_items = data.line_items.map((data: any) => {
			return newOrder.line_items.collection.prepareCreate((line_item: any) => {
				line_item.order.set(newOrder);
				line_item.remote_id = data.id;
				line_item.name = data.name;
				line_item.product_id = data.product_id;
				line_item.variation_id = data.variation_id;
				line_item.quantity = data.quantity;
				line_item.tax_class = data.tax_class;
				line_item.subtotal = data.subtotal;
				line_item.subtotal_tax = data.subtotal_tax;
				line_item.total = data.total;
				line_item.total_tax = data.total_tax;
				line_item.meta_data = data.meta_data;
				line_item.sku = data.sku;
				line_item.price = data.price;
			});
		});
		batch.push(newOrder, ...line_items);
	});
	return await database.action(async () => await database.batch(...batch));
};

export async function syncOrders() {
	const fetch$ = await sync('orders');
	fetch$.subscribe((data: any) => {
		batchAddOrders(data);
	});
}
