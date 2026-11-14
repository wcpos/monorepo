import { Text } from '@wcpos/components/text';
import { getNetPaymentTotal } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useCurrencyFormat } from '../../hooks/use-currency-format';

interface Props {
	order: EngineRecord<'orders'>;
	active?: boolean;
}

/** The strip and open-orders list share the same net, currency-formatted amount. */
export function useOrderAmount(order: EngineRecord<'orders'>): string {
	const total = useRecordField(order, (record) => record.payload.total);
	const refunds = useRecordField(order, (record) => record.payload.refunds);
	const currencySymbol = useRecordField(order, (record) => record.payload.currency_symbol);
	const { format } = useCurrencyFormat({ currencySymbol: currencySymbol ?? '' });
	return format(getNetPaymentTotal(total, refunds) || 0);
}

export function CartTabTitle({ order, active = false }: Props) {
	const amount = useOrderAmount(order);
	return (
		<Text
			className={`tabular-nums ${active ? 'text-foreground font-semibold' : 'text-muted-foreground font-medium'}`}
		>
			{amount}
		</Text>
	);
}
