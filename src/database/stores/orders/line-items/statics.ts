type OrderLineItemDocument = import('../../../types').OrderLineItemDocument;

/**
 * WooCommerce Order Line Item statics
 */
export default {
	/**
	 *
	 */
	// async bulkInsertFromOrder(
	// 	this: OrderLineItemDocument,
	// 	data: Record<string, unknown>[],
	// 	orderId: string
	// ) {
	// 	if (Array.isArray(data) && data.length > 0) {
	// 		return this.bulkInsert(
	// 			data.map((d) => {
	// 				d.order_id = orderId;
	// 				return d;
	// 			})
	// 		);
	// 	}
	// 	return [];
	// },
};
