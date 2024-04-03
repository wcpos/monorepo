import * as React from 'react';

import find from 'lodash/find';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import NumberInput from '../../../components/number-input';
import { useTaxDisplayValues } from '../../../hooks/taxes/use-tax-display-values';
import useCurrencyFormat from '../../../hooks/use-currency-format';
import { useUpdateShippingLine } from '../../hooks/use-update-shipping-line';

type ShippingLine = import('@wcpos/database').OrderDocument['shipping_lines'][number];
interface Props {
	uuid: string;
	item: ShippingLine;
	column: import('@wcpos/components/src/table').ColumnProps<ShippingLine>;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const ShippingTotal = ({ uuid, item, column }: Props) => {
	const { updateShippingLine } = useUpdateShippingLine();
	const { format } = useCurrencyFormat();
	const { display } = column;
	const { displayValue, inclOrExcl } = useTaxDisplayValues({
		value: item.total,
		taxClass: 'standard', // TODO: what to put here?
		taxStatus: 'taxable', // TODO: what to put here? shipping??
		valueIncludesTax: false,
		context: 'cart',
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
				onChange={(total) => updateShippingLine(uuid, { total })}
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
