import * as React from 'react';
import { combineLatest } from 'rxjs';
import { tap } from 'rxjs/operators';
import { useSubscription } from 'observable-hooks';
import forEach from 'lodash/forEach';
import flatten from 'lodash/flatten';
import log from '@wcpos/utils/src/logger';
import useTaxes from '../taxes';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;
type CartItem = LineItemDocument | FeeLineDocument | ShippingLineDocument;

export const useCalcTotals = (cart$, order: OrderDocument) => {
	log.debug('order calc');
	const lineItemRegistry = React.useMemo(() => new Map(), []);
	const feeLineRegistry = React.useMemo(() => new Map(), []);
	const shippingLineRegistry = React.useMemo(() => new Map(), []);
	const { calcLineItemTotals, calcOrderTotals } = useTaxes();

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
	const lineCalc$ = React.useMemo(() => {
		/**
		 * helper function to update order totals (if needed)
		 */
		const updateOrderTotals = async (line_items, fee_lines, shipping_lines) => {
			const orderTotals = calcOrderTotals(flatten([line_items, fee_lines, shipping_lines]));
			await order.atomicPatch(orderTotals);
		};

		return cart$.pipe(
			tap(async ({ line_items = [], fee_lines = [], shipping_lines = [] }) => {
				/**
				 * Line Items
				 */
				forEach(line_items, (lineItem) => {
					if (!lineItemRegistry.has(lineItem._id)) {
						const subscription = combineLatest([
							lineItem.quantity$,
							lineItem.price$,
							lineItem.tax_class$,
						])
							.pipe(
								tap(async ([qty, price, taxClass]) => {
									const totals = calcLineItemTotals(qty, price, taxClass);
									await lineItem.atomicPatch(totals);
									await updateOrderTotals(line_items, fee_lines, shipping_lines);
									// let changed = false;
									// await lineItem.atomicUpdate((oldData) => {
									// 	if (oldData.total !== totals.total) {
									// 		oldData.total = totals.total;
									// 		changed = true;
									// 	}
									// 	return oldData;
									// });
									// if (changed) {
									// 	await updateOrderTotals(line_items, fee_lines, shipping_lines);
									// }
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
						const subscription = combineLatest([
							feeLine.total$,
							feeLine.tax_class$,
							feeLine.tax_status$,
						])
							.pipe(
								tap(async ([price, taxClass, taxStatus]) => {
									const totals = calcLineItemTotals(1, price, taxClass);
									await feeLine.atomicPatch(totals);
									await updateOrderTotals(line_items, fee_lines, shipping_lines);
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
									const totals = calcLineItemTotals(1, price, 'shipping');
									await shippingLine.atomicPatch(totals);
									await updateOrderTotals(line_items, fee_lines, shipping_lines);
								})
							)
							.subscribe();

						shippingLineRegistry.set(shippingLine._id, subscription);
					}
				});

				await updateOrderTotals(line_items, fee_lines, shipping_lines);
			})
		);
	}, [
		calcLineItemTotals,
		calcOrderTotals,
		cart$,
		feeLineRegistry,
		lineItemRegistry,
		order,
		shippingLineRegistry,
	]);

	useSubscription(lineCalc$);
};
