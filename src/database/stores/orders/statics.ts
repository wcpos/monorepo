type OrderCollection = import('../../types').OrderCollection;
type ProductDocument = import('../../types').ProductDocument;

/**
 * WooCommerce Order Collection methods
 */
export default {
	async createNewOrder(this: OrderCollection, product: ProductDocument) {
		// get timestamp and turn it into date_created_gmt, eg: 2020-07-07T14:40:00
		const timestamp = Date.now();
		const date_created_gmt = new Date(timestamp).toISOString().split('.')[0];

		// @ts-ignore
		const newOrder = await this.insert({
			id: `new-${timestamp}`,
			date_created_gmt,
		});
		return newOrder.addOrUpdateLineItem(product);
	},
};
