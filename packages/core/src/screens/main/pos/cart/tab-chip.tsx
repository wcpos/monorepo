import { StatusBadge } from '@wcpos/components/status-badge';
import { derive, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { resolveStage, useCheckoutMode } from '../checkout/checkout-mode';

/**
 * The chip tells the cashier about an order they are NOT looking at. On the active tab the
 * same state is already on screen (ledger, tender pane or receipt stage), and a tinted badge
 * on the filled tab reads blue-on-blue, so the active tab carries no chip.
 */
export function TabChip({
	order,
	active = false,
}: {
	order: EngineRecord<'orders'>;
	active?: boolean;
}) {
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
	return label && !active ? (
		<StatusBadge
			testID={`open-order-chip-${order.uuid}`}
			label={label}
			variant={stage === 'receipt' ? 'success' : 'info'}
		/>
	) : null;
}
