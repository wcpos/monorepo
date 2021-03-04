import { from, of, combineLatest, zip, Observable } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import orderBy from 'lodash/orderBy';

type OrderDocument = import('./orders').OrderDocument;
type ProductDocument = import('../products/products').ProductDocument;
type OrderLineItemDocument = import('../../types').OrderLineItemDocument;
type OrderLineItemCollection = import('../../types').OrderLineItemCollection;
type OrderFeeLineDocument = import('../../types').OrderFeeLineDocument;
type OrderFeeLineCollection = import('../../types').OrderFeeLineCollection;
type OrderShippingLineDocument = import('../../types').OrderShippingLineDocument;
type OrderShippingLineCollection = import('../../types').OrderShippingLineCollection;

/**
 * WooCommerce Order Model methods
 */
export default {
	/**
	 *
	 */
	isOpen(this: OrderDocument) {
		return this.status === 'pending';
	},

	/**
	 *
	 */
	async getLineItems(
		this: OrderDocument,
		q: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Promise<OrderLineItemDocument[]> {
		// note: findByIds returns a map
		const collection: OrderLineItemCollection = this.collections().line_items;
		const lineItems = await collection.findByIds(this.line_items || []);
		const lineItemsArray = Array.from(lineItems.values());
		return orderBy(lineItemsArray, q.sortBy, q.sortDirection);
	},

	/**
	 *
	 */
	getLineItems$(
		this: OrderDocument,
		q: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Observable<OrderLineItemDocument[]> {
		return this.line_items$.pipe(
			switchMap(async (ids) => {
				// note: findByIds returns a map
				const lineItems = await this.collections().line_items.findByIds(ids || []);
				const lineItemsArray = Array.from(lineItems.values());
				return orderBy(lineItemsArray, q.sortBy, q.sortDirection);
			})
		);
	},

	/**
	 *
	 */
	async getFeeLines(
		this: OrderDocument,
		q: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Promise<OrderFeeLineDocument[]> {
		// note: findByIds returns a map
		const collection: OrderFeeLineCollection = this.collections().fee_lines;
		const feeLines = await collection.findByIds(this.fee_lines || []);
		const feeLinesArray = Array.from(feeLines.values());
		return orderBy(feeLinesArray, q.sortBy, q.sortDirection);
	},

	/**
	 *
	 */
	getFeeLines$(
		this: OrderDocument,
		q: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Observable<OrderFeeLineDocument[]> {
		return this.fee_lines$.pipe(
			switchMap(async (ids) => {
				// note: findByIds returns a map
				const feeLines = await this.collections().fee_lines.findByIds(ids || []);
				const feeLinesArray = Array.from(feeLines.values());
				return orderBy(feeLinesArray, q.sortBy, q.sortDirection);
			})
		);
	},

	/**
	 *
	 */
	async getShippingLines(
		this: OrderDocument,
		q: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Promise<OrderShippingLineDocument[]> {
		// note: findByIds returns a map
		const collection: OrderShippingLineCollection = this.collections().shipping_lines;
		const shippingLines = await collection.findByIds(this.shipping_lines || []);
		const shippingLinesArray = Array.from(shippingLines.values());
		return orderBy(shippingLinesArray, q.sortBy, q.sortDirection);
	},

	/**
	 *
	 */
	getShippingLines$(
		this: OrderDocument,
		q: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Observable<OrderShippingLineDocument[]> {
		return this.shipping_lines$.pipe(
			switchMap(async (ids) => {
				// note: findByIds returns a map
				const shippingLines = await this.collections().shipping_lines.findByIds(ids || []);
				const shippingLinesArray = Array.from(shippingLines.values());
				return orderBy(shippingLinesArray, q.sortBy, q.sortDirection);
			})
		);
	},

	/**
	 *
	 */
	getCart$(
		this: OrderDocument,
		q: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Observable<Array<OrderLineItemDocument | OrderFeeLineDocument | OrderShippingLineDocument>> {
		return combineLatest([
			this.getLineItems$(q),
			this.getFeeLines$(q),
			this.getShippingLines$(q),
		]).pipe(
			// @ts-ignore
			map(([lineItems, feeLines, shippingLines]) => lineItems.concat(feeLines, shippingLines))
		);
	},

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
