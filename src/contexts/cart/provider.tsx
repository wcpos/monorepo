import * as React from 'react';
import { combineLatest, distinctUntilChanged } from 'rxjs';
import { switchMap, tap, map, shareReplay } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import isEqual from 'lodash/isEqual';
import log from '@wcpos/utils/src/logger';
import { useCalcTotals } from './use-calc-totals';

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
	/**
	 *
	 */
	const value = React.useMemo(() => {
		/**
		 *
		 */
		const lineItems$ = order.line_items$.pipe(
			switchMap(() => order.populate('line_items')),
			map((line_items) => line_items || []),
			distinctUntilChanged((prev, curr) => {
				return isEqual(
					prev.map((doc) => doc._id),
					curr.map((doc) => doc._id)
				);
			})
		);

		/**
		 *
		 */
		const feeLines$ = order.fee_lines$.pipe(
			switchMap(() => order.populate('fee_lines')),
			map((fee_lines) => fee_lines || []),
			distinctUntilChanged((prev, curr) => {
				return isEqual(
					prev.map((doc) => doc._id),
					curr.map((doc) => doc._id)
				);
			})
		);

		/**
		 *
		 */
		const shippingLines$ = order.shipping_lines$.pipe(
			switchMap(() => order.populate('shipping_lines')),
			map((shipping_lines) => shipping_lines || []),
			distinctUntilChanged((prev, curr) => {
				return isEqual(
					prev.map((doc) => doc._id),
					curr.map((doc) => doc._id)
				);
			})
		);

		/**
		 * Outputs { line_items: [], fee_lines: [], shipping_lines: [] }
		 */
		const cart$ = combineLatest([lineItems$, feeLines$, shippingLines$]).pipe(
			map(([line_items, fee_lines, shipping_lines]) => ({
				line_items,
				fee_lines,
				shipping_lines,
			})),
			tap((args) => {
				log.silly('CartProvider', args);
			}),
			shareReplay(1) // cart$ is subscribed to in multiple places
		);

		/**
		 *
		 */
		return {
			lineItems$,
			feeLines$,
			shippingLines$,
			cart$,
			cartResource: new ObservableResource(cart$),
		};
	}, [order]);

	/**
	 * Calc totals
	 */
	useCalcTotals(value.cart$, order);

	/**
	 *
	 */
	return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

export default CartProvider;
