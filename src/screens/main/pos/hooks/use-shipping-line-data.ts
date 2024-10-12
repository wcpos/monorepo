import * as React from 'react';

import toNumber from 'lodash/toNumber';
import { useObservableEagerState } from 'observable-hooks';

import { parsePosData } from './utils';
import { useAppState } from '../../../../contexts/app-state';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
type TaxStatus = 'taxable' | 'none';

/**
 * Calculate default shipping amount based on tax inclusion.
 */
const calculateDefaultAmount = (item: ShippingLine, pricesIncludeTax: boolean) => {
	const total = toNumber(item.total);
	const totalTax = toNumber(item.total_tax);
	return pricesIncludeTax ? total + totalTax : total;
};

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
		(item: ShippingLine) => {
			const defaultAmount = calculateDefaultAmount(item, pricesIncludeTax);
			const defaultTaxClass = shippingTaxClass === 'inherit' ? '' : shippingTaxClass;
			const defaultTaxStatus = 'taxable';

			let amount = defaultAmount;
			let tax_status: TaxStatus = defaultTaxStatus;
			let tax_class = defaultTaxClass;
			let prices_include_tax = pricesIncludeTax;

			const posData = parsePosData(item);
			if (posData) {
				amount = posData.amount || defaultAmount;
				tax_status = posData.tax_status || defaultTaxStatus;
				tax_class = posData.tax_class || defaultTaxClass;
				prices_include_tax = posData.prices_include_tax ?? pricesIncludeTax;
			}

			return {
				amount,
				tax_status,
				tax_class,
				prices_include_tax,
			};
		},
		[pricesIncludeTax, shippingTaxClass]
	);

	return {
		getShippingLineData,
	};
};
