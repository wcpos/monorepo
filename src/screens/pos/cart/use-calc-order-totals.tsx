import * as React from 'react';
import { combineLatest, debounceTime, distinctUntilChanged } from 'rxjs';
import { switchMap, tap, map, filter } from 'rxjs/operators';
import { useSubscription } from 'observable-hooks';
import forEach from 'lodash/forEach';
import { calcOrderTotals, calcLineItemTotals } from './utils';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type LineItemDocument = import('@wcpos/common/src/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/common/src/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/common/src/database').ShippingLineDocument;
type CartItem = LineItemDocument | FeeLineDocument | ShippingLineDocument;
type Cart = CartItem[];

const rates: any[] = [
	{
		id: 2,
		country: 'GB',
		rate: '20.0000',
		name: 'VAT',
		priority: 1,
		compound: true,
		shipping: true,
		order: 1,
		class: 'standard',
	},
];

const useCalcTotals = (order) => {
	console.log('order calc');
	const lineItemRegistry = new Map();
	const feeLineRegistry = new Map();
	const shippingLineRegistry = new Map();

	/**
	 * Subcribe to all items in cart individually
	 * - subscribe on add, unsubscribe on remove
	 * - unsubscribe on unmount
	 *
	 * I'm handling subscriptions here because the cart items re-render on every change
	 * and I'm trying to reduce that overhead to give the cart the best performance possible
	 */
	React.useEffect(() => {
		// unsubscribe
		return () => {
			lineItemRegistry.forEach((sub) => {
				sub.unsubscribe();
			});
			feeLineRegistry.forEach((sub) => {
				sub.unsubscribe();
			});
			shippingLineRegistry.forEach((sub) => {
				sub.unsubscribe();
			});
		};
	}, [lineItemRegistry, order]);

	/**
	 * add new items to the registry
	 * @TODO - unsubscribe on remove
	 */
	const lineCalc$ = order.cart$.pipe(
		tap(({ line_items = [], fee_lines = [], shipping_lines = [] }) => {
			/**
			 * Line Items
			 */
			forEach(line_items, (lineItem) => {
				if (lineItemRegistry.has(lineItem._id)) {
					return;
				}

				const subscription = combineLatest([lineItem.quantity$, lineItem.price$])
					.pipe(
						map(([qty, price]) => {
							return calcLineItemTotals(qty, price, rates);
						}),
						// distinctUntilChanged((prev, curr) => {
						// 	debugger;
						// 	return isEqual(prev, curr);
						// }),
						tap(async (totals) => {
							await lineItem.atomicPatch(totals);
							const lines = await order.populate('line_items');
							const orderTotals = calcOrderTotals(lines);
							await order.atomicPatch(orderTotals);
						})
					)
					.subscribe();

				lineItemRegistry.set(lineItem._id, subscription);
			});

			/**
			 * Fee Lines
			 */
			forEach(fee_lines, (feeLine) => {
				if (feeLineRegistry.has(feeLine._id)) {
					return;
				}

				const subscription = combineLatest([feeLine.total$])
					.pipe(
						tap(() => {
							debugger;
						})
					)
					.subscribe();

				feeLineRegistry.set(feeLine._id, subscription);
			});

			/**
			 * Shipping Lines
			 */
			forEach(shipping_lines, (shippingLine) => {
				if (shippingLineRegistry.has(shippingLine._id)) {
					return;
				}

				const subscription = combineLatest([shippingLine.total$])
					.pipe(
						tap(() => {
							debugger;
						})
					)
					.subscribe();

				shippingLineRegistry.set(shippingLine._id, subscription);
			});
		})
	);

	/**
	 * Update order totals on any add/remove to cart
	 */
	const orderCalc$ = order.flattenedCart$.pipe(
		// filter(() => !!order._id), // don't calculate totals if order is new
		filter((cart) => cart.length > 0), // don't calculate totals if cart is empty
		map(calcOrderTotals),
		tap((totals) => {
			order.atomicPatch(totals);
		})
	);

	useSubscription(lineCalc$);
	useSubscription(orderCalc$);
};

export default useCalcTotals;
