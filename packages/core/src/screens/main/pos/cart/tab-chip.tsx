import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { activeAwaitingCustomer, derive, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';

import { useStoreSession } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { resolveStage, useCheckoutMode } from '../checkout/checkout-mode';
import { useAwaitsStore } from '../checkout/use-awaiting-store';
import { useOrderSaveState } from '../checkout/use-order-save-state';

/**
 * The chip tells the cashier about an order they are NOT looking at. On the active tab the
 * same state is already on screen (ledger, tender pane or receipt stage), and a tinted badge
 * on the filled tab reads blue-on-blue, so the active tab carries no chip.
 */
export function TabChip({
	order,
	active = false,
	compact = false,
	fallbackLabel,
	fallbackIsStatus = false,
	testIDs = true,
}: {
	order: EngineRecord<'orders'>;
	active?: boolean;
	compact?: boolean;
	fallbackLabel?: string;
	/** The fallback is a real order status (the open-orders list), not the strip's "Cart" word. */
	fallbackIsStatus?: boolean;
	/** Off: a copy rendered for measurement only, so a testID still points at one element. */
	testIDs?: boolean;
}) {
	const payload = useRecordField(order, (record) => record.payload);
	const mode = useCheckoutMode();
	const saveState = useOrderSaveState(order.uuid);
	// ADR 0040 Decided 1 rule 1: the journals, never the status (which flickers on reconnect);
	// not read yet reads as not awaiting, so no tab flashes amber as it mounts.
	const awaits = useAwaitsStore(order.uuid) === true;
	const { methods } = usePaymentMethods();
	const { store } = useStoreSession();
	const { format } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const t = useT();
	const rows = readLedger(payload.meta_data);
	const stage = resolveStage(order.uuid, mode, rows, payload.status);
	// The latest store document, not the session's snapshot (see checkout's use-tender-flow).
	const dp = useDocField(store, (value) => value.price_num_decimals) ?? 2;
	const { balance } = derive(payload.total, rows, methods, { dp });
	// Same set `derive` counts as paid: captured only, an authorization is a hold (ADR 0040 D6).
	const captured = rows.some((row) => row.status === 'captured');
	// Contract 1.2: a sent order waits for its customer; its receipt moment is not a Paid one.
	const sent = activeAwaitingCustomer(payload.meta_data) !== null;
	const waiting = rows.find(
		(row) =>
			row.capture_mode === 'server' && (row.status === 'pending' || row.status === 'authorized')
	);
	const label =
		saveState?.kind === 'rejected'
			? t('pos_checkout.chip_save_refused')
			: // ADR 0040 Decided 1 rule 1: a sale the store has not heard says so until it answers.
				awaits && Number(balance) <= 0
				? t('pos_checkout.chip_paid_awaiting_store')
				: awaits
					? t('pos_checkout.chip_awaiting_store_due', { due: format(Number(balance)) })
					: stage === 'receipt'
						? t(sent ? 'pos_checkout.chip_sent_receipt' : 'pos_checkout.chip_paid_receipt')
						: waiting
							? t('pos_checkout.chip_waiting_for_terminal', {
									amount: format(Number(waiting.amount)),
								})
							: captured && Number(balance) > 0
								? t('pos_checkout.chip_partly_paid', { due: format(Number(balance)) })
								: stage === 'checkout' && !captured
									? t(
											saveState?.kind === 'saving'
												? 'pos_checkout.saving_order'
												: saveState?.kind === 'queued-offline'
													? 'pos_checkout.chip_in_checkout_offline'
													: 'pos_checkout.chip_in_checkout'
										)
									: (fallbackLabel ?? null);
	if (!label) return null;
	const tone = awaits ? 'warning' : stage === 'receipt' ? 'success' : 'info';
	// Plain muted text, no dot: the active tab carries no chip (ledger line 6) but keeps its
	// status word so every tab reads "amount over status"; and the fallback ("Cart") is not a
	// status at all, so it never gets a dot on any tab.
	if (active || (label === fallbackLabel && !fallbackIsStatus)) {
		return compact ? null : (
			<Text
				testID={testIDs ? `open-order-status-${order.uuid}` : undefined}
				className="text-muted-foreground text-sm"
			>
				{label}
			</Text>
		);
	}
	return (
		<StatusBadge
			testID={testIDs ? `open-order-chip-${order.uuid}` : undefined}
			label={compact ? '' : label}
			accessibilityLabel={label}
			variant={saveState?.kind === 'rejected' ? 'error' : tone}
		/>
	);
}
