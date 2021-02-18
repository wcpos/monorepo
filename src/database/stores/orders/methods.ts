type OrderDocument = import('../../types').OrderDocument;
type ProductDocument = import('../../types').ProductDocument;
type OrderLineItemDocument = import('../../types').OrderLineItemDocument;
type OrderFeeLineDocument = import('../../types').OrderFeeLineDocument;
type OrderShippingLineDocument = import('../../types').OrderShippingLineDocument;

/**
 * WooCommerce Order Model methods
 */
export default {
	/**
	 *
	 */
	async addOrUpdateLineItem(
		this: OrderDocument,
		product: ProductDocument,
		parent: ProductDocument
	) {
		await this.collections()
			.line_items.upsert({
				id: `new-${Date.now()}`,
				order_id: this.id,
				name: product.name || parent.name,
				product_id: parent ? parseInt(parent.id || '', 10) : parseInt(product.id || '', 10),
				variation_id: parent && parseInt(product.id || '', 10),
				quantity: 1,
				price: parseFloat(product.price || ''),
				sku: product.sku,
				tax_class: product.tax_class,
			})
			.then((newLineItem: OrderLineItemDocument) => {
				return this.update({
					$push: {
						line_items: newLineItem.id,
					},
				});
			});
	},

	/**
	 *
	 */
	async computedSubtotal() {},

	/**
	 *
	 */
	async removeLineItem(this: OrderDocument, lineItem: OrderLineItemDocument) {
		await this.update({
			$pullAll: {
				line_items: [lineItem.id],
			},
		}).then(() => {
			return lineItem.remove();
		});
	},

	/**
	 *
	 */
	async addFeeLine(this: OrderDocument, data: Record<string, unknown>) {
		await this.collections()
			.fee_lines.upsert({ ...data, id: `new-${Date.now()}`, order_id: this.id })
			.then((newFee: OrderFeeLineDocument) => {
				return this.update({
					$push: {
						fee_lines: newFee.id,
					},
				});
			});
	},

	/**
	 *
	 */
	async removeFeeLine(this: OrderDocument, feeLine: OrderFeeLineDocument) {
		await this.update({
			$pullAll: {
				fee_lines: [feeLine.id],
			},
		}).then(() => {
			return feeLine.remove();
		});
	},

	/**
	 *
	 */
	async addShippingLine(this: OrderDocument, data: Record<string, unknown>) {
		await this.collections()
			.shipping_lines.upsert({ ...data, id: `new-${Date.now()}`, order_id: this.id })
			.then((newShipping: OrderShippingLineDocument) => {
				return this.update({
					$push: {
						shipping_lines: newShipping.id,
					},
				});
			});
	},

	/**
	 *
	 */
	async removeShippingLine(this: OrderDocument, shippingLine: OrderShippingLineDocument) {
		await this.update({
			$pullAll: {
				shipping_lines: [shippingLine.id],
			},
		}).then(() => {
			return shippingLine.remove();
		});
	},
};
