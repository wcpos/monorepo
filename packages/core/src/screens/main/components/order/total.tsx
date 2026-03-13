import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';

import { useCurrencyFormat } from '../../hooks/use-currency-format';

import type { CellContext } from '@tanstack/react-table';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export function Total({ row, column }: CellContext<{ document: OrderDocument }, 'total'>) {
	const order = row.original.document;
	const total = useObservableEagerState(order.total$!);
	const currencySymbol = useObservableEagerState(order.currency_symbol$!);
	const payment_method_title = useObservableEagerState(order.payment_method_title$!);
	const refunds = useObservableEagerState(order.refunds$!);
	const { format } = useCurrencyFormat({ currencySymbol: currencySymbol as string });
	const show = (column.columnDef.meta as { show?: (key: string) => boolean } | undefined)?.show;

	const refundTotal = React.useMemo(() => {
		if (!refunds?.length) return 0;
		return refunds.reduce((sum, r) => sum + Math.abs(parseFloat(r.total || '0')), 0);
	}, [refunds]);

	return (
		<>
			<Text>{format(parseFloat(total ?? '0'))}</Text>
			{refundTotal > 0 && (
				<Text className="text-destructive text-right text-sm">{format(-refundTotal)}</Text>
			)}
			{show?.('payment_method') && (
				<Text className="text-muted-foreground text-right text-sm">{payment_method_title}</Text>
			)}
		</>
	);
}
