type LineItemCollection = import('.').LineItemCollection;

/**
 * WooCommerce Order Line Item statics
 */
export default {
	/**
	 * Fix for WC REST Api error, line_item.parent_name can be null
	 */
	preInsertParentName(this: LineItemCollection, plainData: Record<string, unknown>) {
		if (!plainData.parentName) {
			plainData.parentName = '';
		}
		return plainData;
	},
};
