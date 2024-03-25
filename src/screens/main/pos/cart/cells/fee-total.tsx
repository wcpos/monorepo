import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useTaxHelpers } from '../../../contexts/tax-helpers';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import { useCurrentOrder } from '../../contexts/current-order';

interface Props {
	item: import('@wcpos/database').FeeLineDocument;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const FeeTotal = ({ item, column }: Props) => {
	const { currentOrder } = useCurrentOrder();

	const total = parseFloat(item.total);
	const { format } = useCurrencyFormat();
	const { display } = column;
	const { store } = useAppState();
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const { calculateTaxesFromPrice } = useTaxHelpers();
	const taxes = calculateTaxesFromPrice({
		price: total,
		taxClass: item.tax_class,
		taxStatus: item.tax_status,
		pricesIncludeTax: false,
	});
	const displayTotal = taxDisplayCart === 'incl' ? total + taxes.total : total;

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		(newValue) => {
			let total = parseFloat(newValue);
			if (taxDisplayCart === 'incl') {
				const taxes = calculateTaxesFromPrice({
					price: total,
					taxClass: item.tax_class,
					taxStatus: item.tax_status,
					pricesIncludeTax: true,
				});
				total = parseFloat(newValue) - taxes.total;
			}
			currentOrder.incrementalModify((order) => {
				const updatedItems = order.fee_lines.map((li) => {
					const uuidMetaData = li.meta_data.find((meta) => meta.key === '_woocommerce_pos_uuid');
					if (uuidMetaData && uuidMetaData.value === item.uuid) {
						return {
							...li,
							total: String(total),
						};
					}
					return li;
				});

				return { ...order, fee_lines: updatedItems };
			});
		},
		[
			calculateTaxesFromPrice,
			currentOrder,
			item.tax_class,
			item.tax_status,
			item.uuid,
			taxDisplayCart,
		]
	);

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	/**
	 *
	 */
	return (
		<Box space="xSmall" align="end">
			<NumberInput value={String(displayTotal)} onChange={handleUpdate} showDecimals />
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart}. ${format(item.total_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
