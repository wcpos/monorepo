import { from, of, combineLatest, Observable } from 'rxjs';
import { switchMap, tap, catchError, map, debounceTime } from 'rxjs/operators';
import _orderBy from 'lodash/orderBy';
import _filter from 'lodash/filter';
import _sumBy from 'lodash/sumBy';
import _map from 'lodash/map';

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
type CartLine = Array<LineItemDocument | FeeLineDocument | ShippingLineDocument>;
type CartLines = Array<LineItemDocument | FeeLineDocument | ShippingLineDocument>;

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
					debugger;
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
				debugger;
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
			debugger;
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
					debugger;
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
				debugger;
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
			debugger;
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
				debugger;
			});

		return this.update({
			$push: {
				fee_lines: newFee._id,
			},
		}).catch((err: any) => {
			debugger;
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
				debugger;
			});

		return this.update({
			$push: {
				shipping_lines: newShipping._id,
			},
		}).catch((err: any) => {
			console.log(err);
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

		const success = await item.collection.insert(itemJSON).catch(() => {
			debugger;
		});

		if (success) {
			return this.atomicUpdate((order) => {
				order[item.collection.name] = order[item.collection.name] ?? [];
				order[item.collection.name].push(success._id);
				return order;
			}).catch((err: any) => {
				debugger;
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
			console.log(res);
		});
	},

	// /**
	//  *
	//  */
	// computedTotal$(this: OrderDocument) {
	// 	return this.getCart$().pipe(
	// 		switchMap((cartLines: CartLines) => {
	// 			const totals$ = _map(cartLines, 'total$');
	// 			return combineLatest(totals$);
	// 		}),
	// 		map((totals: string[]) => String(_sumBy(totals, (total) => Number(total ?? 0)))),
	// 		tap((total: string) => {
	// 			if (total !== this.total) this.atomicPatch({ total });
	// 		})
	// 	);
	// },

	// /**
	//  *
	//  */
	// computedSubtotal$(this: OrderDocument) {
	// 	return this.getLineItems$().pipe(
	// 		switchMap((lineItems: LineItemDocument[]) => {
	// 			const subtotals$ = _map(lineItems, 'subtotal$');
	// 			return combineLatest(subtotals$);
	// 		}),
	// 		map((subtotals: string[]) => String(_sumBy(subtotals, (subtotal) => Number(subtotal ?? 0))))
	// 	);
	// },

	// /**
	//  *
	//  */
	// computedTotalTax$(this: OrderDocument) {
	// 	return this.getCart$().pipe(
	// 		switchMap((cartLines: CartLines) => {
	// 			const totalTax$ = _map(cartLines, (cartLine) => cartLine.computedTotalTax$());
	// 			return combineLatest(totalTax$);
	// 		}),
	// 		map((totals: string[]) => String(_sumBy(totals, (total) => Number(total ?? 0)))),
	// 		tap((totalTax: string) => {
	// 			if (totalTax !== this.totalTax) this.atomicPatch({ total_tax: totalTax });
	// 		})
	// 	);
	// },
};
