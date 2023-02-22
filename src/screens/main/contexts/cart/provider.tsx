import * as React from 'react';

import flatten from 'lodash/flatten';
import { ObservableResource, useSubscription } from 'observable-hooks';
import { combineLatest, iif, of } from 'rxjs';
import { switchMap, map, catchError, filter } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useTaxCalculation from '../../hooks/use-tax-calculation';

type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;

export const CartContext = React.createContext<{
	cartResource: ObservableResource<{
		line_items: LineItemDocument[];
		fee_lines: FeeLineDocument[];
		shipping_lines: ShippingLineDocument[];
	}>;
}>(null);

interface CartContextProps {
	children: React.ReactNode;
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
const CartProvider = ({ children, order }: CartContextProps) => {
	const { calcLineItemTotals, calcOrderTotals } = useTaxCalculation();

	/**
	 *
	 */
	const value = React.useMemo(() => {
		/**
		 * Outputs { line_items: [], fee_lines: [], shipping_lines: [] }
		 */
		const cart$ = combineLatest([
			order.populate$('line_items'),
			order.populate$('fee_lines'),
			order.populate$('shipping_lines'),
		]).pipe(
			map(([line_items, fee_lines, shipping_lines]) => ({
				line_items,
				fee_lines,
				shipping_lines,
			}))
		);

		/**
		 *
		 */
		const lineItemTotals$ = order.populate$('line_items').pipe(
			switchMap((items) =>
				iif(
					() => items.length === 0,
					of([]),
					combineLatest(
						items.map((item) =>
							combineLatest([item.quantity$, item.price$, item.tax_class$]).pipe(
								map(([qty, price, taxClass]) => {
									const totals = calcLineItemTotals(qty, price, taxClass);
									item.incrementalPatch(totals);
									return totals;
								})
							)
						)
					)
				)
			)
		);

		/**
		 *
		 */
		const feeLineTotals$ = order.populate$('fee_lines').pipe(
			switchMap((items) =>
				iif(
					() => items.length === 0,
					of([]),
					combineLatest(
						items.map((item) => {
							return combineLatest([item.total$, item.tax_class$, item.tax_status$]).pipe(
								map(([price, taxClass, taxStatus]) => {
									const totals = calcLineItemTotals(1, price, taxClass);
									item.incrementalPatch(totals);
									return totals;
								})
							);
						})
					)
				)
			)
		);

		/**
		 *
		 */
		const shippingLineTotals$ = order.populate$('shipping_lines').pipe(
			switchMap((items) =>
				iif(
					() => items.length === 0,
					of([]),
					combineLatest(
						items.map((item) => {
							return combineLatest([item.total$]).pipe(
								map(([price]) => {
									const totals = calcLineItemTotals(1, price, 'shipping');
									item.incrementalPatch(totals);
									return totals;
								})
							);
						})
					)
				)
			)
		);

		/**
		 *
		 */
		const cartTotals$ = combineLatest([lineItemTotals$, feeLineTotals$, shippingLineTotals$]).pipe(
			map((totals) => flatten(totals)),
			filter((totals) => totals.length > 0),
			map((cartTotals) => {
				const totals = calcOrderTotals(cartTotals);
				order.incrementalPatch(totals);
				return totals;
			}),
			catchError((err) => {
				log.error(err);
			})
		);

		/**
		 *
		 */
		return {
			cart$,
			cartResource: new ObservableResource(cart$),
			cartTotals$,
		};
	}, [calcLineItemTotals, calcOrderTotals, order]);

	/**
	 * Calc totals
	 * NOTE - want to subscribe here? maybe its better to subscribe in the component?
	 * Do I ever want to use the cart without updating the totals?
	 */
	useSubscription(value.cartTotals$);

	/**
	 *
	 */
	return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export default CartProvider;
