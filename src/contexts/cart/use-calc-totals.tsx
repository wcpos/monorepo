import * as React from 'react';
import { combineLatest } from 'rxjs';
import { tap } from 'rxjs/operators';
import { useSubscription } from 'observable-hooks';
import forEach from 'lodash/forEach';
import flatten from 'lodash/flatten';
import { calcOrderTotals, calcLineItemTotals } from './utils';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type CartItem = LineItemDocument | FeeLineDocument | ShippingLineDocument;

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

export const useCalcTotals = (cart$, order: OrderDocument) => {
	console.log('order calc');
	const lineItemRegistry = React.useMemo(() => new Map(), []);
	const feeLineRegistry = React.useMemo(() => new Map(), []);
	const shippingLineRegistry = React.useMemo(() => new Map(), []);

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
	}, [feeLineRegistry, lineItemRegistry, shippingLineRegistry]);

	/**
	 * add new items to the registry
	 * @TODO - unsubscribe on remove
	 */
	const lineCalc$ = cart$.pipe(
		tap(({ line_items = [], fee_lines = [], shipping_lines = [] }) => {
			/**
			 * Line Items
			 */
			forEach(line_items, (lineItem) => {
				if (!lineItemRegistry.has(lineItem._id)) {
					const subscription = combineLatest([lineItem.quantity$, lineItem.price$])
						.pipe(
							tap(async ([qty, price]) => {
								const totals = calcLineItemTotals(qty, price, rates);
								await lineItem.atomicPatch(totals);
								const orderTotals = calcOrderTotals(
									flatten([line_items, fee_lines, shipping_lines])
								);
								await order.atomicPatch(orderTotals);
							})
						)
						.subscribe();

					lineItemRegistry.set(lineItem._id, subscription);
				}
			});

			/**
			 * Fee Lines
			 */
			forEach(fee_lines, (feeLine) => {
				if (!feeLineRegistry.has(feeLine._id)) {
					const subscription = combineLatest([feeLine.total$])
						.pipe(
							tap(async ([price]) => {
								const totals = calcLineItemTotals(1, price, rates);
								await feeLine.atomicPatch(totals);
								const orderTotals = calcOrderTotals(
									flatten([line_items, fee_lines, shipping_lines])
								);
								await order.atomicPatch(orderTotals);
							})
						)
						.subscribe();

					feeLineRegistry.set(feeLine._id, subscription);
				}
			});

			/**
			 * Shipping Lines
			 */
			forEach(shipping_lines, (shippingLine) => {
				if (!shippingLineRegistry.has(shippingLine._id)) {
					const subscription = combineLatest([shippingLine.total$])
						.pipe(
							tap(async ([price]) => {
								const totals = calcLineItemTotals(1, price, rates);
								await shippingLine.atomicPatch(totals);
								const orderTotals = calcOrderTotals(
									flatten([line_items, fee_lines, shipping_lines])
								);
								await order.atomicPatch(orderTotals);
							})
						)
						.subscribe();

					shippingLineRegistry.set(shippingLine._id, subscription);
				}
			});
		})
	);

	useSubscription(lineCalc$);
};
