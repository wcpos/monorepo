import * as React from 'react';

import flatten from 'lodash/flatten';
import { ObservableResource, useSubscription, useObservableState } from 'observable-hooks';
import { Observable, combineLatest, iif, of } from 'rxjs';
import { switchMap, map, catchError, filter, distinctUntilChanged } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useTaxCalculation from '../../hooks/use-tax-calculation';

type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;

export const CartContext = React.createContext<{
	cart$: Observable<{
		line_items: LineItemDocument[];
		fee_lines: FeeLineDocument[];
		shipping_lines: ShippingLineDocument[];
	}>;
	cartResource: ObservableResource<{
		line_items: LineItemDocument[];
		fee_lines: FeeLineDocument[];
		shipping_lines: ShippingLineDocument[];
	}>;
	cartTotals$: Observable<{
		total: string;
		subtotal: string;
		total_tax: string;
		subtotal_tax: string;
		discount_total: string;
		discount_tax: string;
		tax_lines: {
			rate_id: number;
			label: string;
			compound: boolean;
			tax_total: string;
		}[];
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
	const { calcLineItemTotals, calcOrderTotals, calcShippingLineTotals, calculateLineItemTaxes } =
		useTaxCalculation();

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
							combineLatest([item.subtotal$, item.total$, item.tax_class$, item.meta_data$]).pipe(
								distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next)),
								map(([subtotal, total, taxClass, metaData = []]) => {
									// get taxStatus from meta_data
									const taxStatus = metaData.find(
										(m) => m.key === '_woocommerce_pos_tax_status'
									)?.value;
									const taxes = calculateLineItemTaxes({ subtotal, total, taxClass, taxStatus });
									item.incrementalPatch({ ...taxes });
									return { subtotal, total, ...taxes };
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
									const totals = calcLineItemTotals(1, price, taxClass, taxStatus);
									const merged = Object.assign(item.toMutableJSON(), totals);
									if (JSON.stringify(merged) !== JSON.stringify(item.toJSON())) {
										item.incrementalPatch(totals);
									}
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
								map(([total]) => {
									const totals = calcShippingLineTotals(total);
									const merged = Object.assign(item.toMutableJSON(), totals);
									if (JSON.stringify(merged) !== JSON.stringify(item.toJSON())) {
										item.incrementalPatch(totals);
									}
									return totals;
								})
							);
						})
					)
				)
			)
		);

		/**
		 * Note: WC REST API order total is total + total_tax
		 */
		const cartTotals$ = combineLatest([lineItemTotals$, feeLineTotals$, shippingLineTotals$]).pipe(
			map((totals) => flatten(totals)),
			// filter((totals) => totals.length > 0),
			map((cartTotals) => {
				const totals = calcOrderTotals(cartTotals);
				order.incrementalPatch({
					discount_tax: totals.discount_tax,
					discount_total: totals.discount_total,
					// shipping_tax: totals.shipping_tax,
					// shipping_total: totals.shipping_total,
					cart_tax: totals.cart_tax,
					total_tax: totals.total_tax,
					total: String(parseFloat(totals.total) + parseFloat(totals.total_tax)),
					tax_lines: totals.tax_lines,
				});
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
	}, [calcLineItemTotals, calcOrderTotals, calcShippingLineTotals, calculateLineItemTaxes, order]);

	/**
	 * Calc totals
	 * NOTE - want to subscribe here? maybe its better to subscribe in the component?
	 * Do I ever want to use the cart without updating the totals?
	 */
	// useSubscription(value.cartTotals$);

	/**
	 *
	 */
	return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export default CartProvider;
