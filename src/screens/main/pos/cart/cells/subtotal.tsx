import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useCurrencyFormat from '../../../hooks/use-currency-format';

interface Props {
	item:
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
}

export const Subtotal = ({ item, column }: Props) => {
	const subtotal = useObservableState(item.subtotal$, item.subtotal);
	const subtotal_tax = useObservableState(item.subtotal_tax$, item.subtotal_tax);
	const { format } = useCurrencyFormat();
	const { display } = column;

	/**
	 * TODO - move this into the ui as a helper function
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(display, { key });
			return !!(d && d.show);
		},
		[display]
	);

	return (
		<Box space="xSmall">
			<Text>{format(subtotal || 0)}</Text>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`excl. ${format(subtotal_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
