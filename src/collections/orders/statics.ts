type OrderCollection = import('.').OrderCollection;
type ProductDocument = import('../products').ProductDocument;

/**
 * WooCommerce Order Collection statics
 */
export default {
	/**
	 *
	 */
	async createNewOrderWithProduct(this: OrderCollection, product: ProductDocument) {
		// get timestamp and turn it into date_created_gmt, eg: 2020-07-07T14:40:00
		const timestamp = Date.now();
		const date_created_gmt = new Date(timestamp).toISOString().split('.')[0];

		// @ts-ignore
		const newOrder = await this.insert({ date_created_gmt, status: 'pos-open' });
		return newOrder.addOrUpdateLineItem(product);
	},
};
