import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';

import { useCurrencyFormat } from '../../hooks/use-currency-format';

type Props = {
	item: import('@wcpos/database').OrderDocument;
	column: any;
};

/**
 *
 */
const Total = ({ item: order, column }: Props) => {
	const total = useObservableEagerState(order.total$);
	const currencySymbol = useObservableEagerState(order.currency_symbol$);
	const payment_method_title = useObservableEagerState(order.payment_method_title$);
	const { format } = useCurrencyFormat({ currencySymbol });

	/**
	 *
	 */
	const show = React.useCallback(
		(key: string): boolean => {
			const d = find(column.display, { key });
			return !!(d && d.show);
		},
		[column.display]
	);

	return (
		<>
			<Text>{format(total || 0)}</Text>
			{show('payment_method') && <Text type="secondary">{payment_method_title}</Text>}
		</>
	);
};

export default Total;
