import * as React from 'react';

import flatten from 'lodash/flatten';
import forEach from 'lodash/forEach';
import { useSubscription } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';

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
			await order.incrementalPatch(orderTotals);
		};

		return cart$.pipe(
			tap(({ line_items = [], fee_lines = [], shipping_lines = [] }) => {
				// this works but needs to be optimsed, ie: subscribe only to total?
				// const array = flatten([line_items, fee_lines, shipping_lines]).map((item) => item.$);
				// combineLatest(array).subscribe((res) => {
				// 	const orderTotals = calcOrderTotals(res);
				// 	order.incrementalPatch(orderTotals);
				// });

				/**
				 * Line Items
				 */
				forEach(line_items, (lineItem) => {
					if (!lineItemRegistry.has(lineItem.uuid)) {
						const subscription = combineLatest([
							lineItem.quantity$,
							lineItem.price$,
							lineItem.tax_class$,
						])
							.pipe(
								tap(([qty, price, taxClass]) => {
									const totals = calcLineItemTotals(qty, price, taxClass);
									lineItem.incrementalPatch(totals);
								})
							)
							.subscribe();

						lineItemRegistry.set(lineItem.uuid, subscription);
					}
				});

				/**
				 * Fee Lines
				 */
				forEach(fee_lines, (feeLine) => {
					if (!feeLineRegistry.has(feeLine.uuid)) {
						const subscription = combineLatest([
							feeLine.total$,
							feeLine.tax_class$,
							feeLine.tax_status$,
						])
							.pipe(
								tap(([price, taxClass, taxStatus]) => {
									const totals = calcLineItemTotals(1, price, taxClass);
									feeLine.incrementalPatch(totals);
								})
							)
							.subscribe();

						feeLineRegistry.set(feeLine.uuid, subscription);
					}
				});

				/**
				 * Shipping Lines
				 */
				forEach(shipping_lines, (shippingLine) => {
					if (!shippingLineRegistry.has(shippingLine.uuid)) {
						const subscription = combineLatest([shippingLine.total$])
							.pipe(
								tap(([price]) => {
									const totals = calcLineItemTotals(1, price, 'shipping');
									shippingLine.incrementalPatch(totals);
								})
							)
							.subscribe();

						shippingLineRegistry.set(shippingLine.uuid, subscription);
					}
				});
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
