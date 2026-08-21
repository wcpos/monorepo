import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { CellContext } from '@wcpos/core/table-types';

import { useCurrencyFormat } from '../../hooks/use-currency-format';

/**
 *
 */
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
	const { format } = useCurrencyFormat({
		currencySymbol: currencySymbol as string,
	});
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
				<Text className="text-muted-foreground text-right text-sm">{paymentMethodTitle}</Text>
			)}
		</>
	);
}
