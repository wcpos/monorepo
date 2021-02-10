/**
 * WooCommerce Order Line Item methods
 */
export default {
	/**
	 *
	 */
	computedTotal() {
		return this.quantity * this.price;
	},
	/**
	 *
	 */
	computedSubtotal() {
		return this.quantity * this.price;
	},
};
