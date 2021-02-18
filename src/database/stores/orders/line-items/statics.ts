type OrderFeeLineDocument = import('../../../types').OrderFeeLineDocument;

/**
 * WooCommerce Order Line Item statics
 */
export default {
	/**
	 *
	 */
	async bulkInsertFromOrder(
		this: OrderFeeLineDocument,
		data: Record<string, unknown>[],
		orderId: string
	) {
		if (Array.isArray(data) && data.length > 0) {
			this.bulkInsert(
				data.map((d) => {
					d.order_id = orderId;
					return d;
				})
			);
		}
	},
};
