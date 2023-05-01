import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Checkbox from '@wcpos/components/src/checkbox';
import Text from '@wcpos/components/src/text';

import { t } from '../../../../../lib/translations';
import NumberInput from '../../../components/number-input';
import useCurrencyFormat from '../../../hooks/use-currency-format';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

/**
 * Changing the total actually updates the price, because the WC REST API makes no sense
 */
export const Total = ({ item, column }: Props) => {
	const total = useObservableState(item.total$, item.total);
	const subtotal = useObservableState(item.subtotal$, item.subtotal);
	const total_tax = useObservableState(item.total_tax$, item.total_tax);
	const { format } = useCurrencyFormat();
	const { display } = column;
	// const [editable, setEditable] = React.useState(parseFloat(total) !== parseFloat(subtotal));
	const editable = parseFloat(total) !== parseFloat(subtotal);

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		(newValue) => {
			const quantity = item.getLatest().quantity;
			item.incrementalPatch({
				total: newValue,
				price: parseFloat(newValue) / quantity,
			});
		},
		[item]
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
	// const handleOnSaleChange = React.useCallback(
	// 	(onSale) => {
	// 		if (onSale) {
	// 			item.incrementalPatch({
	// 				total: subtotal,
	// 			});
	// 		}
	// 		setEditable(onSale);
	// 	},
	// 	[item, subtotal]
	// );

	/**
	 *
	 */
	return (
		<Box space="xSmall" align="end">
			{editable ? (
				<NumberInput value={total} onChange={handleUpdate} showDecimals />
			) : (
				<Text>{format(subtotal || 0)}</Text>
			)}

			{show('tax') && (
				<Text type="textMuted" size="small">
					{`excl. ${format(total_tax) || 0} tax`}
				</Text>
			)}

			{/* <Checkbox
				value={editable}
				label={t('On sale', { _tags: 'core' })}
				size="xSmall"
				type="secondary"
				onChange={handleOnSaleChange}
			/> */}
		</Box>
	);
};
