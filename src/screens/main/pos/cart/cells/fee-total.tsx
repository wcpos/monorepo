import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import { useAppState } from '../../../../../contexts/app-state';
import NumberInput from '../../../components/number-input';
import { useTaxHelpers } from '../../../contexts/tax-helpers';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import { useUpdateFeeLine } from '../../hooks/use-update-fee-line';

type FeeLine = import('@wcpos/database').OrderDocument['fee_lines'][number];
interface Props {
	uuid: string;
	item: FeeLine;
	column: import('@wcpos/components/src/table').ColumnProps<FeeLine>;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const FeeTotal = ({ uuid, item, column }: Props) => {
	const { updateFeeLine } = useUpdateFeeLine();

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
			<NumberInput
				value={String(displayTotal)}
				onChange={(total) => updateFeeLine(uuid, { total })}
				showDecimals
			/>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart}. ${format(item.total_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
