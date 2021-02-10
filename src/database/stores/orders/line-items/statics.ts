/**
 * WooCommerce Order Line Item statics
 */
export default {
	
	/**
	 *
	 */
	async bulkInsertFromOrder(data: [], orderId: string) {
		this.bulkInsert(
			data.map((d) => {
				d.order_id = orderId;
				return d;
			})
		);
	},

}