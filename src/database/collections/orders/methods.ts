import { from, of, combineLatest, Observable } from 'rxjs';
import { switchMap, tap, catchError, map, debounceTime } from 'rxjs/operators';
import orderBy from 'lodash/orderBy';
import filter from 'lodash/filter';
import sumBy from 'lodash/sumBy';
import isArray from 'lodash/isArray';

type OrderDocument = import('./orders').OrderDocument;
type ProductDocument = import('../products/products').ProductDocument;
type LineItemDocument = import('../line-items').LineItemDocument;
type LineItemCollection = import('../line-items').LineItemCollection;
type FeeLineDocument = import('../fee-lines').FeeLineDocument;
type FeeLineCollection = import('../fee-lines').FeeLineCollection;
type ShippingLineDocument = import('../shipping-lines').ShippingLineDocument;
type ShippingLineCollection = import('../shipping-lines').ShippingLineCollection;
type ProductVariationDocument = import('../product-variations').ProductVariationDocument;
type CustomerDocument = import('../customers').CustomerDocument;

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
	getLineItems$(
		this: OrderDocument,
		q?: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Observable<LineItemDocument[]> {
		return this.lineItems$.pipe(
			switchMap(async (ids) => {
				console.log(ids);
				const lineItems = await this.populate('lineItems');
				return q ? orderBy(lineItems, q.sortBy, q.sortDirection) : lineItems;
			})
		);
	},

	/**
	 *
	 */
	getFeeLines$(
		this: OrderDocument,
		q?: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Observable<FeeLineDocument[]> {
		return this.feeLines$.pipe(
			switchMap(async (ids) => {
				console.log(ids);
				const feeLines = await this.populate('feeLines');
				return q ? orderBy(feeLines, q.sortBy, q.sortDirection) : feeLines;
			})
			// tap((res) => {
			// 	debugger;
			// })
		);
	},

	/**
	 *
	 */
	getShippingLines$(
		this: OrderDocument,
		q?: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Observable<ShippingLineDocument[]> {
		return this.shippingLines$.pipe(
			switchMap(async (ids) => {
				console.log(ids);
				const shippingLines = await this.populate('shippingLines');
				return q ? orderBy(shippingLines, q.sortBy, q.sortDirection) : shippingLines;
			})
		);
	},

	/**
	 *
	 */
	getCart$(
		this: OrderDocument,
		q?: { sortBy: string; sortDirection: 'asc' | 'desc' }
	): Observable<Array<LineItemDocument | FeeLineDocument | ShippingLineDocument>> {
		return combineLatest([
			this.getLineItems$(q),
			this.getFeeLines$(q),
			this.getShippingLines$(q),
		]).pipe(
			/**
			 * the population promises return at different times
			 * debounce emissions to prevent unneccesary re-renders
			 * @TODO - is there a better way?
			 */
			debounceTime(10),
			map(([lineItems = [], feeLines = [], shippingLines = []]) =>
				lineItems.concat(feeLines, shippingLines)
			)
		);
	},

	/**
	 *
	 */
	async addOrUpdateLineItem(
		this: OrderDocument,
		product: ProductDocument | ProductVariationDocument,
		parent: ProductDocument
	): Promise<OrderDocument | void> {
		// check lineItems for same product id
		const productId = parent ? parent.id : product.id;
		const populatedLineItems = await this.populate('lineItems');
		const existingProducts = filter(populatedLineItems, { productId }) as LineItemDocument[];

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
		const newLineItem: LineItemDocument = await this.collections()
			.line_items.insert({
				productId,
				name: product.name || parent.name,
				variationId: parent && product.id,
				quantity: 1,
				price: parseFloat(product.price || ''),
				sku: product.sku,
				tax_class: product.tax_class,
			})
			.catch((err: any) => {
				debugger;
			});

		/**
		 * Add new line item id to the lineItems
		 * - use atomicUpdate just in case lineItems is undefined
		 */
		return this.atomicUpdate((order) => {
			if (!isArray(order.lineItems)) {
				order.lineItems = [];
			}
			order.lineItems.push(newLineItem._id);
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
				lineItems: [lineItem._id],
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
			.fee_lines.insert(data)
			.then((newFee: FeeLineDocument) => {
				return this.update({
					$push: {
						feeLines: newFee._id,
					},
				});
			});
	},

	/**
	 *
	 */
	async removeFeeLine(this: OrderDocument, feeLine: FeeLineDocument) {
		await this.update({
			$pullAll: {
				feeLines: [feeLine._id],
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
			.shipping_lines.insert(data)
			.then((newShipping: ShippingLineDocument) => {
				return this.update({
					$push: {
						shippingLines: newShipping._id,
					},
				});
			})
			.catch((err: any) => {
				console.log(err);
			});
	},

	/**
	 *
	 */
	async removeShippingLine(this: OrderDocument, shippingLine: ShippingLineDocument) {
		await this.update({
			$pullAll: {
				shippingLines: [shippingLine._id],
			},
		}).then(() => {
			return shippingLine.remove();
		});
	},

	/**
	 *
	 */
	async addCustomer(this: OrderDocument, customer: CustomerDocument) {
		await this.atomicPatch({
			customerId: customer.id,
			billing: {
				email: customer.email,
			},
		}).then((res) => {
			console.log(res);
		});
	},

	/**
	 *
	 */
	computedTotal$(this: OrderDocument) {
		return this.getCart$().pipe(
			// @ts-ignore
			switchMap((cartLines) => combineLatest(cartLines.map((cartLine) => cartLine.total$))),
			map((totals: string[]) => String(sumBy(totals, (total) => Number(total)))),
			tap((total: string) => {
				console.log(`Order Total: ${total}`);
				if (total !== this.total) this.atomicPatch({ total });
			})
		);
	},
};
