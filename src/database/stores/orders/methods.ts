/**
 * WooCommerce Order Model methods
 */
export default {
	/**
	 *
	 */
	async addOrUpdateLineItem(product, parent) {
		await this.collections()
			.line_items.upsert({
				id: `new-${Date.now()}`,
				order_id: this.id,
				name: product.name || parent.name,
				product_id: parent ? parseInt(parent.id, 10) : parseInt(product.id, 10),
				variation_id: parent && parseInt(product.id, 10),
				quantity: 1,
				price: parseFloat(product.price),
				sku: product.sku,
				tax_class: product.tax_class,
			})
			.then((newLineItem) => {
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
	async removeLineItem(lineItem) {
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
	async addFeeLine(data) {
		await this.collections()
			.fee_lines.upsert({ ...data, id: `new-${Date.now()}`, order_id: this.id })
			.then((newFee) => {
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
	async removeFeeLine(feeLine) {
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
	async addShippingLine(data) {
		await this.collections()
			.shipping_lines.upsert({ ...data, id: `new-${Date.now()}`, order_id: this.id })
			.then((newShipping) => {
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
	async removeShippingLine(shippingLine) {
		await this.update({
			$pullAll: {
				shipping_lines: [shippingLine.id],
			},
		}).then(() => {
			return shippingLine.remove();
		});
	},
};
