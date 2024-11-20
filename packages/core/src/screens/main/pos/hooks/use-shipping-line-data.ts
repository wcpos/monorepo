import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { extractShippingLineData } from './utils';
import { useAppState } from '../../../../contexts/app-state';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];

/**
 * Custom hook to retrieve and process shipping line data.
 */
export const useShippingLineData = () => {
	const { store } = useAppState();
	const shippingTaxClass = useObservableEagerState(store.shipping_tax_class$);
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$) === 'yes';

	/**
	 * Retrieves and processes the shipping line data.
	 */
	const getShippingLineData = React.useCallback(
		(item: ShippingLine) => extractShippingLineData(item, pricesIncludeTax, shippingTaxClass),
		[pricesIncludeTax, shippingTaxClass]
	);

	return {
		getShippingLineData,
	};
};
