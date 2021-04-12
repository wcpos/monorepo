type OrderFeeLineDocument = import('../../../types').OrderFeeLineDocument;

/**
 * WooCommerce Order Line Item methods
 */
export default {
	/**
	 *
	 */
	computedTotal(this: OrderFeeLineDocument) {
		return this.get('quantity') * this.get('price');
	},
	/**
	 *
	 */
	computedSubtotal(this: OrderFeeLineDocument) {
		return this.get('quantity') * this.get('price');
	},
};
