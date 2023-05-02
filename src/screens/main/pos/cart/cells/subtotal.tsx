import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import NumberInput from '../../../components/number-input';
import useCurrencyFormat from '../../../hooks/use-currency-format';

interface Props {
	item: import('@wcpos/database').LineItemDocument;
}

/**
 *
 */
export const Subtotal = ({ item, column }: Props) => {
	const subtotal = useObservableState(item.subtotal$, item.subtotal);
	const subtotal_tax = useObservableState(item.subtotal_tax$, item.subtotal_tax);
	const { format } = useCurrencyFormat();
	const { display } = column;

	/**
	 *
	 */
	const handleUpdate = React.useCallback(
		(subtotal) => {
			item.incrementalPatch({ subtotal });
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
	return (
		<Box space="xSmall" align="end">
			<NumberInput value={subtotal} onChange={handleUpdate} showDecimals />
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`excl. ${format(subtotal_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
