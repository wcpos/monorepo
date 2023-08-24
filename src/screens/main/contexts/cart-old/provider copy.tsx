import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { Observable, combineLatest, iif, of } from 'rxjs';
import { switchMap, map, catchError, distinctUntilChanged } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { useCurrentOrder } from '../../pos/contexts/current-order';
import { useTaxHelpers } from '../tax-helpers';

type LineItemDocument = import('@wcpos/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/database').ShippingLineDocument;

interface Cart {
	line_items: LineItemDocument[];
	fee_lines: FeeLineDocument[];
	shipping_lines: ShippingLineDocument[];
}

interface CartTotals {
	discount_total: string;
	discount_tax: string;
	shipping_total: string;
	shipping_tax: string;
	cart_tax: string;
	subtotal: string;
	subtotal_tax: string;
	total: string;
	total_tax: string;
	fee_total: string;
	fee_tax: string;
	tax_lines: {
		rate_id: number;
		label: string;
		compound: boolean;
		tax_total: string;
	}[];
}

export const CartContext = React.createContext<{
	cart$: Observable<Cart>;
	cartResource: ObservableResource<Cart>;
	cartTotals$: Observable<CartTotals>;
	cartTotalsResource: ObservableResource<CartTotals>;
}>(null);

interface CartContextProps {
	children: React.ReactNode;
}

/**
 *
 */
const CartProvider = ({ children }: CartContextProps) => {
	const { currentOrder: order } = useCurrentOrder();
	const { calculateOrderTotals, calculateShippingLineTaxes, calculateLineItemTaxes } =
		useTaxHelpers();

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
									const taxStatus = metaData.find((m) => m.key === '_woocommerce_pos_tax_status')
										?.value;
									const taxes = calculateLineItemTaxes({ subtotal, total, taxClass, taxStatus });
									item.incrementalPatch(taxes);
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
								distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next)),
								map(([total, taxClass, taxStatus]) => {
									const taxes = calculateLineItemTaxes({ total, taxClass, taxStatus });
									item.incrementalPatch(taxes);
									return { total, ...taxes };
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
								distinctUntilChanged((prev, next) => JSON.stringify(prev) === JSON.stringify(next)),
								map(([total]) => {
									const taxes = calculateShippingLineTaxes({ total });
									item.incrementalPatch(taxes);
									return { total, ...taxes };
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
			map(([lineItems, feeLines, shippingLines]) => {
				const totals = calculateOrderTotals({ lineItems, feeLines, shippingLines });
				order.incrementalPatch({
					discount_tax: totals.discount_tax,
					discount_total: totals.discount_total,
					shipping_tax: totals.shipping_tax,
					shipping_total: totals.shipping_total,
					cart_tax: totals.cart_tax,
					total_tax: totals.total_tax,
					total: totals.total,
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
			cartTotalsResource: new ObservableResource(cartTotals$),
		};
	}, [calculateOrderTotals, calculateShippingLineTaxes, calculateLineItemTaxes, order]);

	/**
	 * Calc totals
	 * NOTE - want to subscribe here? maybe its better to subscribe in the component?
	 * Do I ever want to use the cart without updating the totals?
	 */
	// useSubscription(value.cartTotals$); // subscribing instead in the totals component where I need the subtotal

	/**
	 *
	 */
	return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export default CartProvider;
