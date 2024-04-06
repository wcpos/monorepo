import * as React from 'react';

import find from 'lodash/find';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import NumberInput from '../../../components/number-input';
import { useTaxDisplayValues } from '../../../hooks/taxes/use-tax-display-values';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useUpdateLineItem } from '../../hooks/use-update-line-item';
import { getTaxStatusFromMetaData } from '../../hooks/utils';

type LineItem = import('@wcpos/database').OrderDocument['line_items'][number];
interface Props {
	uuid: string;
	item: LineItem;
	column: import('@wcpos/components/src/table').ColumnProps<LineItem>;
}

/**
 *
 */
export const Subtotal = ({ uuid, item, column }: Props) => {
	const { updateLineItem } = useUpdateLineItem();
	const { format } = useCurrencyFormat();
	const { display } = column;
	const taxStatus = getTaxStatusFromMetaData(item.meta_data);
	const { displayValue, inclOrExcl } = useTaxDisplayValues({
		value: item.subtotal,
		taxClass: item.tax_class,
		taxStatus,
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
				onChange={(subtotal) => updateLineItem(uuid, { subtotal })}
				showDecimals
			/>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${inclOrExcl} ${format(item.subtotal_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
