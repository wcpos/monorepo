import { Text } from '@wcpos/components/text';
import { getNetPaymentTotal } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

interface Props {
	order: EngineRecord<'orders'>;
}

/**
 *
 */
export function CartTabTitle({ order }: Props) {
	const total = useRecordField(order, (record) => record.payload.total);
	const refunds = useRecordField(order, (record) => record.payload.refunds);
	const currencySymbol = useRecordField(order, (record) => record.payload.currency_symbol);
	const { format } = useCurrencyFormat({ currencySymbol: currencySymbol ?? '' });
	const t = useT();

	const displayTotal = getNetPaymentTotal(total, refunds);

	return <Text>{t('pos_cart.cart', { order_total: format(displayTotal || 0) })}</Text>;
}
