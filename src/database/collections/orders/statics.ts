type OrderCollection = import('.').OrderCollection;
type ProductDocument = import('../products').ProductDocument;
type ProductVariationDocument = import('../product-variations').ProductVariationDocument;

/**
 * WooCommerce Order Collection statics
 */
export default {
	/**
	 *
	 */
	async createNewOrderWithProduct(
		this: OrderCollection,
		product: ProductDocument | ProductVariationDocument
	) {
		// get timestamp and turn it into date_created_gmt, eg: 2020-07-07T14:40:00
		const timestamp = Date.now();
		const dateCreatedGmt = new Date(timestamp).toISOString().split('.')[0];

		// @ts-ignore
		const newOrder = await this.insert({ dateCreatedGmt });
		return newOrder.addOrUpdateLineItem(product);
	},
};
