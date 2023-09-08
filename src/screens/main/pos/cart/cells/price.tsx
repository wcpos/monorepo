import * as React from 'react';

import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useTaxHelpers } from '../../../contexts/tax-helpers';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

const getTaxStatus = (meta_data) => {
	if (!Array.isArray(meta_data)) return undefined;

	const meta = meta_data.find((meta) => meta && meta.key === '_woocommerce_pos_tax_status');

	return meta ? meta.value : undefined;
};

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
	return <NumberInput value={String(displayPrice)} onChange={handleUpdate} showDecimals />;
};
