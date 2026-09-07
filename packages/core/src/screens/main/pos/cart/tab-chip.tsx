import { StatusBadge } from '@wcpos/components/status-badge';
import { derive, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { resolveStage, useCheckoutMode } from '../checkout/checkout-mode';

export function TabChip({ order }: { order: EngineRecord<'orders'> }) {
	const payload = useRecordField(order, (record) => record.payload);
	const mode = useCheckoutMode();
	const { methods } = usePaymentMethods();
	const { store } = useStoreSession();
	const { format } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const t = useT();
	const rows = readLedger(payload.meta_data);
	const stage = resolveStage(order.uuid, mode, rows);
	const { balance } = derive(payload.total, rows, methods, { dp: store.price_num_decimals ?? 2 });
	const captured = rows.some((row) => row.status === 'captured');
	const label =
		stage === 'receipt'
			? t('pos_checkout.chip_paid_receipt')
			: captured && Number(balance) > 0
				? t('pos_checkout.chip_partly_paid', { due: format(Number(balance)) })
				: stage === 'checkout' && !captured
					? t('pos_checkout.chip_in_checkout')
					: null;
	return label ? (
		<StatusBadge
			testID={`open-order-chip-${order.uuid}`}
			label={label}
			variant={stage === 'receipt' ? 'success' : 'info'}
		/>
	) : null;
}
