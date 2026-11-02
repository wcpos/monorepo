import * as React from 'react';

import { useDocField } from '@wcpos/query';

import { extractShippingLineData } from './utils';
import { useAppState } from '../../../../contexts/app-state';

type ShippingLine = import('@wcpos/query').OrderShippingLine;

/**
 * Custom hook to retrieve and process shipping line data.
 */
export const useShippingLineData = () => {
	const { store } = useAppState();
	const shippingTaxClass = useDocField(store, (value) => value.shipping_tax_class);
	const pricesIncludeTax = useDocField(store, (value) => value.prices_include_tax) === 'yes';

	/**
	 * Retrieves and processes the shipping line data.
	 */
	const getShippingLineData = React.useCallback(
		(item: ShippingLine) =>
			extractShippingLineData(item, pricesIncludeTax, shippingTaxClass as string),
		[pricesIncludeTax, shippingTaxClass]
	);

	return {
		getShippingLineData,
	};
};
