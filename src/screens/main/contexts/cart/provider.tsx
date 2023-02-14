import * as React from 'react';

import flatten from 'lodash/flatten';
import isEqual from 'lodash/isEqual';
import { ObservableResource } from 'observable-hooks';
import { combineLatest, distinctUntilChanged } from 'rxjs';
import { switchMap, tap, map, shareReplay } from 'rxjs/operators';

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
			})),
			shareReplay(1) // cart$ is subscribed to in multiple places to calculate totals
		);

		/**
		 *
		 */
		return {
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
