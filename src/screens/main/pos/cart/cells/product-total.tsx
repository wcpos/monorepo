import * as React from 'react';

import find from 'lodash/find';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';

import useLocalData from '../../../../../contexts/local-data';
import useCurrencyFormat from '../../../hooks/use-currency-format';

interface Props {
	item:
		| import('@wcpos/database').LineItemDocument
		| import('@wcpos/database').FeeLineDocument
		| import('@wcpos/database').ShippingLineDocument;
}

export const ProductTotal = ({ item, column }: Props) => {
	const total = useObservableState(item.total$, item.total);
	const total_tax = useObservableState(item.total_tax$, item.total_tax);
	const { format } = useCurrencyFormat();
	const { display } = column;
	const { store } = useLocalData();
	const taxDisplayCart = useObservableState(store.tax_display_cart$, store.tax_display_cart);
	const displayTotal =
		taxDisplayCart === 'incl' ? parseFloat(total) + parseFloat(total_tax) : total;

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
		<Box space="xSmall" align="end">
			<Text>{format(displayTotal || 0)}</Text>
			{show('tax') && (
				<Text type="textMuted" size="small">
					{`${taxDisplayCart}. ${format(total_tax) || 0} tax`}
				</Text>
			)}
		</Box>
	);
};
