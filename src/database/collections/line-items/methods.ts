type LineItemDocument = import('../../').LineItemDocument;

/**
 * WooCommerce Order Line Item methods
 */
export default {
	/**
	 *
	 */
	computedTotal(this: LineItemDocument) {
		return this.get('quantity') * this.get('price');
	},

	/**
	 *
	 */
	computedSubtotal(this: LineItemDocument) {
		return this.get('quantity') * this.get('price');
	},
};
