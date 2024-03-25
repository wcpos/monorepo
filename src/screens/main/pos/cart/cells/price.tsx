import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useTaxHelpers } from '../../../contexts/tax-helpers';
import useUI from '../../../contexts/ui-settings';
import { useCurrentOrder } from '../../contexts/current-order';

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
	const { currentOrder } = useCurrentOrder();

	// find meta data value when key = _woocommerce_pos_tax_status
	const taxStatus = getTaxStatus(item.meta_data) ?? 'taxable';
	const { store } = useAppState();
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const { calculateTaxesFromPrice } = useTaxHelpers();
	const taxes = calculateTaxesFromPrice({
		price: item.price,
		taxClass: item.tax_class,
		taxStatus,
		pricesIncludeTax: false,
	});
	const displayPrice = taxDisplayCart === 'incl' ? item.price + taxes.total : item.price;

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
		async (newValue: string) => {
			let newPrice = parseFloat(newValue);
			if (taxDisplayCart === 'incl') {
				const taxes = calculateTaxesFromPrice({
					price: newPrice,
					taxClass: item.tax_class,
					taxStatus,
					pricesIncludeTax: true,
				});
				newPrice = parseFloat(newValue) - taxes.total;
			}
			const newTotal = String(item.quantity * newPrice);
			currentOrder.incrementalModify((order) => {
				const updatedLineItems = order.line_items.map((li) => {
					const uuidMetaData = li.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMetaData && uuidMetaData.value === item.uuid) {
						return {
							...li,
							price: newPrice,
							total: newTotal,
						};
					}
					return li;
				});

				return { ...order, line_items: updatedLineItems };
			});
		},
		[
			calculateTaxesFromPrice,
			currentOrder,
			item.quantity,
			item.tax_class,
			item.uuid,
			taxDisplayCart,
			taxStatus,
		]
	);

	/**
	 *
	 */
	return (
		<NumberInput
			value={String(displayPrice)}
			onChange={handleUpdate}
			showDecimals
			showDiscounts={ensureNumberArray(quickDiscounts)}
		/>
	);
};
