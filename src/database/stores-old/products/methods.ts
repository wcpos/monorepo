type ProductDocument = import('../../types').ProductDocument;

/**
 * WooCommerce Product Model methods
 */
export default {
	/**
	 *
	 */
	isVariable(this: ProductDocument): boolean {
		return this.type === 'variable';
	},
};
