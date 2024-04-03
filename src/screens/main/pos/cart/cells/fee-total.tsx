import * as React from 'react';

import find from 'lodash/find';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import NumberInput from '../../../components/number-input';
import { useTaxDisplayValues } from '../../../hooks/taxes/use-tax-display-values';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import { useCurrentOrder } from '../../contexts/current-order';
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
	const { currentOrder } = useCurrentOrder();
	const { format } = useCurrencyFormat({ currencySymbol: currentOrder.currency_symbol });
	const { display } = column;
	const { displayValue, inclOrExcl } = useTaxDisplayValues({
		value: item.total,
		taxClass: item.tax_class,
		taxStatus: item.tax_status,
		context: 'cart',
		valueIncludesTax: false,
	});

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
				value={displayValue}
				onChange={(total) => updateFeeLine(uuid, { total })}
				showDecimals
			/>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${inclOrExcl} ${format(item.total_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
