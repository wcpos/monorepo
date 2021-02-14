/**
 * WooCommerce Order Line Item statics
 */
export default {
	
	/**
	 *
	 */
	async bulkInsertFromOrder(data: [], orderId: string) {
		if (Array.isArray(data) && data.length > 0) {
			this.bulkInsert(
				data.map((d) => {
					d.order_id = orderId;
					return d;
				})
			);
		}
	},

}