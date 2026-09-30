import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useCurrencyFormat } from '../../../hooks/use-currency-format';

export function Total({ row, column }: CellContext<{ record: EngineRecord<'orders'> }, 'total'>) {
	const { total, currencySymbol, paymentMethodTitle, refunds } = useRecordField(
		row.original.record,
		({ payload }) => ({
			total: payload.total,
			currencySymbol: payload.currency_symbol,
			paymentMethodTitle: payload.payment_method_title,
			refunds: payload.refunds,
		})
	);
	const show = (column.columnDef.meta as { show?: (key: string) => boolean } | undefined)?.show;
	return (
		<OrderTotal
			total={total}
			currencySymbol={currencySymbol as string}
			refunds={refunds}
			paymentMethodTitle={show?.('payment_method') ? paymentMethodTitle : undefined}
		/>
	);
}

export function OrderTotal({
	total,
	currencySymbol,
	refunds,
	paymentMethodTitle,
}: Pick<EngineRecord<'orders'>['payload'], 'total' | 'refunds'> & {
	currencySymbol?: string;
	paymentMethodTitle?: string;
}) {
	const { format } = useCurrencyFormat({ currencySymbol });

	const refundTotal = React.useMemo(() => {
		if (!refunds?.length) return 0;
		return refunds.reduce((sum, r) => sum + Math.abs(parseFloat(r.total || '0')), 0);
	}, [refunds]);

	return (
		<>
			<Text className="text-right tabular-nums">{format(parseFloat(total ?? '0'))}</Text>
			{refundTotal > 0 && (
				<Text className="text-destructive text-right text-sm tabular-nums">
					{format(-refundTotal)}
				</Text>
			)}
			{paymentMethodTitle && (
				<Text className="text-muted-foreground text-right text-sm">{paymentMethodTitle}</Text>
			)}
		</>
	);
}
