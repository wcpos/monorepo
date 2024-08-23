import * as React from 'react';

import find from 'lodash/find';
import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';

import { useCurrencyFormat } from '../../hooks/use-currency-format';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Total = ({ row, column }: CellContext<OrderDocument, 'total'>) => {
	const order = row.original;
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
