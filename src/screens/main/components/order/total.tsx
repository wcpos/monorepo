import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';

import { useCurrencyFormat } from '../../hooks/use-currency-format';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Total = ({ row, column }: CellContext<{ document: OrderDocument }, 'total'>) => {
	const order = row.original.document;
	const total = useObservableEagerState(order.total$);
	const currencySymbol = useObservableEagerState(order.currency_symbol$);
	const payment_method_title = useObservableEagerState(order.payment_method_title$);
	const { format } = useCurrencyFormat({ currencySymbol });
	const { show } = column.columnDef.meta;

	return (
		<>
			<Text>{format(parseFloat(total))}</Text>
			{show('payment_method') && (
				<Text className="text-sm text-right text-muted-foreground">{payment_method_title}</Text>
			)}
		</>
	);
};
