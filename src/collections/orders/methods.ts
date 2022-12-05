import _filter from 'lodash/filter';
import _find from 'lodash/find';

import log from '@wcpos/utils/src/logger';

type OrderDocument = import('./orders').OrderDocument;
type OrderCollection = import('./orders').OrderCollection;
type ProductDocument = import('../products/products').ProductDocument;
type LineItemDocument = import('../line-items').LineItemDocument;
type LineItemCollection = import('../line-items').LineItemCollection;
type FeeLineDocument = import('../fee-lines').FeeLineDocument;
type FeeLineCollection = import('../fee-lines').FeeLineCollection;
type ShippingLineDocument = import('../shipping-lines').ShippingLineDocument;
type ShippingLineCollection = import('../shipping-lines').ShippingLineCollection;
type ProductVariationDocument = import('../variations').ProductVariationDocument;
type CustomerDocument = import('../customers').CustomerDocument;
type CartLine = (LineItemDocument | FeeLineDocument | ShippingLineDocument)[];
type CartLines = (LineItemDocument | FeeLineDocument | ShippingLineDocument)[];

/**
 * WooCommerce Order Model methods
 */
export default {
	/**
	 *
	 */
	isOpen(this: OrderDocument) {
		return this.status === 'pos-open';
	},

	/**
	 *
	 */
	isCartEmpty(this: OrderDocument) {
		return (
			(!this.line_items || this.line_items.length === 0) &&
			(!this.fee_lines || this.fee_lines.length === 0) &&
			(!this.shipping_lines || this.shipping_lines.length === 0)
		);
	},

	/**
	 *
	 */
	async addOrUpdateProduct(
		this: OrderDocument,
		product: ProductDocument
	): Promise<OrderDocument | void> {
		// check lineItems for same product id
		const populatedLineItems = await this.populate('line_items');
		const existingProducts = _filter(populatedLineItems, {
			product_id: product.id,
		}) as LineItemDocument[];

		// if product exists, increase quantity by 1
		if (existingProducts.length === 1) {
			await existingProducts[0]
				.update({
					$inc: {
						quantity: 1,
					},
				})
				.catch((err: any) => {
					log.error(err);
				});
			return this;
		}

		// else, create new lineItem
		const newLineItem: LineItemDocument = await this.collection.database.collections.line_items
			.insert({
				product_id: product.id,
				name: product.name,
				quantity: 1,
				price: parseFloat(product.price || ''),
				sku: product.sku,
				tax_class: product.tax_class,
				meta_data: product.meta_data,
			})
			.catch((err: any) => {
				log.error(err);
			});

		/**
		 * Add new line item id to the lineItems
		 * - use atomicUpdate just in case lineItems is undefined
		 */
		return this.atomicUpdate((order) => {
			order.line_items = order.line_items ?? [];
			order.line_items.push(newLineItem._id);
			return order;
		}).catch((err: any) => {
			log.error(err);
		});
	},

	/**
	 *
	 */
	async addOrUpdateVariation(
		this: OrderDocument,
		product: ProductVariationDocument,
		parent: ProductDocument,
		metaData: any
	): Promise<OrderDocument | void> {
		// check lineItems for same product id
		const populatedLineItems = await this.populate('line_items');
		const existingVariations = _filter(populatedLineItems, {
			variation_id: product.id,
		}) as LineItemDocument[];

		// if product exists, increase quantity by 1
		if (existingVariations.length === 1) {
			await existingVariations[0]
				.update({
					$inc: {
						quantity: 1,
					},
				})
				.catch((err: any) => {
					log.error(err);
				});
			return this;
		}

		const meta_data = product.meta_data || [];

		// else, create new lineItem
		const newLineItem: LineItemDocument = await this.collection.database.collections.line_items
			.insert({
				product_id: parent.id,
				name: parent.name,
				variation_id: product.id,
				quantity: 1,
				price: parseFloat(product.price || ''),
				sku: product.sku,
				tax_class: product.tax_class,
				meta_data: meta_data.concat(metaData),
			})
			.catch((err: any) => {
				log.error(err);
			});

		/**
		 * Add new line item id to the lineItems
		 * - use atomicUpdate just in case lineItems is undefined
		 */
		return this.atomicUpdate((order) => {
			order.line_items = order.line_items ?? [];
			order.line_items.push(newLineItem._id);
			return order;
		}).catch((err: any) => {
			log.error(err);
		});
	},

	/**
	 *
	 */
	async removeLineItem(this: OrderDocument, lineItem: LineItemDocument) {
		await this.update({
			$pullAll: {
				line_items: [lineItem._id],
			},
		}).then(() => {
			return lineItem.remove();
		});
	},

	/**
	 *
	 */
	async addFeeLine(this: OrderDocument, data: Record<string, unknown>) {
		const newFee = await this.collection.database.collections.fee_lines
			.insert(data)
			.catch((err: any) => {
				log.error(err);
			});

		return this.update({
			$push: {
				fee_lines: newFee._id,
			},
		}).catch((err: any) => {
			log.error(err);
		});
	},

	/**
	 *
	 */
	async removeFeeLine(this: OrderDocument, feeLine: FeeLineDocument) {
		await this.update({
			$pullAll: {
				fee_lines: [feeLine._id],
			},
		}).then(() => {
			return feeLine.remove();
		});
	},

	/**
	 *
	 */
	async addShippingLine(this: OrderDocument, data: Record<string, unknown>) {
		const newShipping = await this.collection.database.collections.shipping_lines
			.insert(data)
			.catch((err: any) => {
				log.error(err);
			});

		return this.update({
			$push: {
				shipping_lines: newShipping._id,
			},
		}).catch((err: any) => {
			log.error(err);
		});
	},

	/**
	 *
	 */
	async removeShippingLine(this: OrderDocument, shippingLine: ShippingLineDocument) {
		await this.update({
			$pullAll: {
				shipping_lines: [shippingLine._id],
			},
		}).then(() => {
			return shippingLine.remove();
		});
	},

	/**
	 *
	 */
	async removeCartLine(this: OrderDocument, item: CartLine) {
		// @ts-ignore
		switch (item.collection.name) {
			case 'line_items':
				return this.removeLineItem(item);
			case 'fee_lines':
				return this.removeFeeLine(item);
			case 'shipping_lines':
				return this.removeShippingLine(item);
			default:
				return null;
		}
	},

	/**
	 *
	 */
	async undoRemoveCartLine(this: OrderDocument, item: CartLine) {
		const itemJSON = item.toJSON();

		const success = await item.collection.insert(itemJSON).catch((err) => {
			log.error(err);
		});

		if (success) {
			return this.atomicUpdate((order) => {
				order[item.collection.name] = order[item.collection.name] ?? [];
				order[item.collection.name].push(success._id);
				return order;
			}).catch((err: any) => {
				log.error(err);
			});
		}
	},

	/**
	 *
	 */
	async addCustomer(this: OrderDocument, customer: CustomerDocument) {
		await this.atomicPatch({
			customer_id: customer.id,
			billing: {
				email: customer.email,
			},
		}).then((res) => {
			log.error(res);
		});
	},

	/**
	 * Helper to extract the payment URL from the order
	 */
	getPaymentURL(this: OrderDocument) {
		if (this.links?.payment) {
			const link = this.links.payment.find((link: any) => link.href);
			return link?.href;
		}
	},

	/**
	 * Helper to extract the receipt URL from the order
	 */
	getReceiptURL(this: OrderDocument) {
		if (this.links?.receipt) {
			const link = this.links.receipt.find((link: any) => link.href);
			return link?.href;
		}
	},
};
