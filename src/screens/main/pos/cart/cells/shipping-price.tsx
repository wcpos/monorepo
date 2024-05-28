import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useTaxCalculator } from '../../../hooks/taxes/use-tax-calculator';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';
import { getMetaDataValueByKey } from '../../hooks/utils';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
interface Props {
	uuid: string;
	item: ShippingLine;
	column: import('@wcpos/components/src/table').ColumnProps<ShippingLine>;
}

/**
 *
 */
export const ShippingPrice = ({ uuid, item, column }: Props) => {
	const { updateShippingLine } = useUpdateShippingLine();
	const { store } = useAppState();
	const taxDisplayCart = useObservableEagerState(store.tax_display_cart$);
	const { calculateTaxesFromValue } = useTaxCalculator();
	const shippingTaxClass = useObservableEagerState(store.shipping_tax_class$);
	const pricesIncludeTax = useObservableEagerState(store.prices_include_tax$);

	/**
	 *
	 */
	const displayPrice = React.useMemo(() => {
		const defaultPricesIncludeTax = pricesIncludeTax === 'yes';
		const defaultTaxClass = shippingTaxClass === 'inherit' ? 'standard' : shippingTaxClass;
		const defaultAmount = defaultPricesIncludeTax
			? String(parseFloat(item.total) + parseFloat(item.total_tax))
			: item.total;
		const defaultTaxStatus = 'taxable';

		let displayPrice = defaultAmount;

		try {
			const posData = getMetaDataValueByKey(item.meta_data, '_woocommerce_pos_data');
			if (posData) {
				const parsedData = JSON.parse(posData);
				const {
					amount = defaultAmount,
					tax_status = defaultTaxStatus,
					tax_class = defaultTaxClass,
					prices_include_tax = defaultPricesIncludeTax,
				} = parsedData;

				displayPrice = amount;

				// mismatched tax settings
				if (taxDisplayCart === 'excl' && prices_include_tax) {
					const taxes = calculateTaxesFromValue({
						value: amount,
						taxStatus: tax_status,
						taxClass: tax_class,
						valueIncludesTax: true,
					});

					displayPrice = String(parseFloat(amount) - taxes.total);
				}

				// mismatched tax settings
				if (taxDisplayCart === 'incl' && !prices_include_tax) {
					const taxes = calculateTaxesFromValue({
						value: amount,
						taxStatus: tax_status,
						taxClass: tax_class,
						valueIncludesTax: true,
					});

					displayPrice = String(parseFloat(amount) + taxes.total);
				}
			}
		} catch (error) {
			console.error('Error parsing posData:', error);
		}

		return displayPrice;
	}, [
		calculateTaxesFromValue,
		item.meta_data,
		item.total,
		item.total_tax,
		pricesIncludeTax,
		shippingTaxClass,
		taxDisplayCart,
	]);

	/**
	 *
	 */
	return (
		<NumberInput
			value={displayPrice}
			onChange={(amount) => updateShippingLine(uuid, { amount })}
			showDecimals
			// showDiscounts={ensureNumberArray(quickDiscounts)}
		/>
	);
};
