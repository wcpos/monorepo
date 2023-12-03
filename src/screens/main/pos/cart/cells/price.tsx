import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useTaxHelpers } from '../../../contexts/tax-helpers';
import useUI from '../../../contexts/ui-settings';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

const getTaxStatus = (meta_data) => {
	if (!Array.isArray(meta_data)) return undefined;

	const meta = meta_data.find((meta) => meta && meta.key === '_woocommerce_pos_tax_status');

	return meta ? meta.value : undefined;
};

function ensureNumberArray(input: string | number[]): number[] {
	if (typeof input === 'string') {
			// Split the string by commas (or another separator if needed), and convert each part to a number
			return input.split(',').map(Number);
	} else if (Array.isArray(input)) {
			// Convert each element of the array to a number
			return input.map(Number);
	} else {
			// If input is neither a string nor an array, return an empty array or handle as needed
			return [];
	}
}

/**
 *
 */
export const Price = ({ item }: Props) => {
	
	const price = useObservableState(item.price$, item.price);
	const taxClass = useObservableState(item.tax_class$, item.tax_class);
	// find meta data value when key = _woocommerce_pos_tax_status
	const _taxStatus = useObservableState(
		item.meta_data$.pipe(map((meta_data) => getTaxStatus(meta_data))),
		getTaxStatus(item.meta_data)
	);
	const taxStatus = _taxStatus ?? 'taxable';
	const { store } = useAppState();
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const { calculateTaxesFromPrice } = useTaxHelpers();
	const taxes = calculateTaxesFromPrice({ price, taxClass, taxStatus, pricesIncludeTax: false });
	const displayPrice = taxDisplayCart === 'incl' ? price + taxes.total : price;

	/**
	 * Discounts
	 */
	const { uiSettings } = useUI('pos.cart');
	const quickDiscounts = useObservableState(
		uiSettings.get$('quickDiscounts'),
		uiSettings.get('quickDiscounts')
	);


	/**
	 * update subtotal, not price
	 */
	const handleUpdate = React.useCallback(
		(newValue: string) => {
			let newPrice = parseFloat(newValue);
			if (taxDisplayCart === 'incl') {
				const taxes = calculateTaxesFromPrice({
					price: newPrice,
					taxClass,
					taxStatus,
					pricesIncludeTax: true,
				});
				newPrice = parseFloat(newValue) - taxes.total;
			}
			const quantity = item.getLatest().quantity;
			const newTotal = String(quantity * newPrice);
			item.incrementalPatch({ price: newPrice, total: newTotal });
		},
		[calculateTaxesFromPrice, item, taxClass, taxDisplayCart, taxStatus]
	);

	/**
	 *
	 */
	return <NumberInput 
		value={String(displayPrice)} 
		onChange={handleUpdate} 
		showDecimals 
		showDiscounts={ensureNumberArray(quickDiscounts)} 
	/>;
};
