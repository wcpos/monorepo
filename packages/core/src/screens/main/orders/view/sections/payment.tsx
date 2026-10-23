import * as React from 'react';
import { View } from 'react-native';

import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { activeAwaitingCustomer } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { Section } from './_section';
import { totalRefunded } from './total-refunded';
import { useT } from '../../../../../contexts/translations';
import { useStoreDayLabel } from '../../../../../hooks/use-store-day-label';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useDateFormat } from '../../../hooks/use-date-format';
import { LedgerLegs } from '../../../pos/checkout/tender/ledger-pane';
import { useLedgerView } from '../../../pos/checkout/tender/use-ledger-view';

/**
 * The order's payments in the cart's own words: the same `LedgerLegs` the tender cart draws,
 * closing on Total · Paid · Remaining while money is owed. An order with no POS journal (paid
 * online, or older than the journal) gets one row in the leg recipe from Woo's own fields.
 */
export function PaymentSection({ order }: { order: EngineRecord<'orders'> }) {
	const t = useT();
	const payload = useRecordField(order, (record) => record.payload);
	const view = useLedgerView(order);
	const { format } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const { dateTime } = useStoreDayLabel();
	const method = payload.payment_method_title || payload.payment_method;
	const paidAt = payload.date_paid_gmt ? dateTime(payload.date_paid_gmt) : null;
	const refunded = totalRefunded(payload.refunds);
	const stamp = activeAwaitingCustomer(payload.meta_data);
	const sentOn = useDateFormat(stamp?.sent_at_gmt, 'MMM d, h:mm a', false);
	const legs = view.rows.length > 0;
	// Nothing taken yet: the ledger's own words ("No payments yet", then Total · Paid ·
	// Remaining), never a method row that reads as paid. A dead order owes nothing.
	const dead = ['cancelled', 'failed', 'refunded', 'trash'].includes(payload.status ?? '');
	const owing = !legs && !paidAt && view.balanceMinor > 0 && !dead;
	// The ledger derives the balance from the journal alone; a cancelled or refunded order
	// keeps its legs as history but owes nothing, so it never closes on Remaining.
	const closing = view.balanceMinor > 0 && !dead;
	const fallback = !legs && !owing && Boolean(method || paidAt || payload.transaction_id);

	if (!legs && !owing && !fallback && refunded === 0 && !stamp) return null;

	return (
		<Section
			title={
				view.rows.length > 1
					? t('pos_checkout.payments_tab')
					: t('common.payment', { _: 'Payment' })
			}
		>
			{legs || owing ? <LedgerLegs view={view} format={view.format} closing={closing} /> : null}
			{fallback ? (
				<View testID="order-modal-payment" className="border-border gap-1 border-b py-2">
					<View className="flex-row items-center justify-between gap-2">
						<Text className="flex-1 text-sm font-medium" decodeHtml>
							{method ?? ''}
						</Text>
						<Text className="text-sm tabular-nums">{format(Number(payload.total || 0))}</Text>
						{paidAt ? (
							<StatusBadge label={t('pos_checkout.status_captured')} variant="success" />
						) : null}
					</View>
					{paidAt ? (
						<Text className="text-muted-foreground text-xs tabular-nums">
							{`${t('orders.captured')} ${paidAt}`}
						</Text>
					) : null}
					{payload.transaction_id ? (
						<Text className="text-muted-foreground text-xs">
							{`${t('common.transaction_id')} ${payload.transaction_id}`}
						</Text>
					) : null}
				</View>
			) : null}
			{stamp ? (
				<Text className="text-muted-foreground mt-2 text-xs">
					{`${t('pos_checkout.invoice_sent')} ${
						stamp.destination
							? t('pos_checkout.sent_to_on', { destination: stamp.destination, date: sentOn ?? '' })
							: t('pos_checkout.sent_on', { date: sentOn ?? '' })
					}`}
				</Text>
			) : null}
			{refunded > 0 ? (
				<View className="mt-2 flex-row items-baseline justify-between gap-3">
					<Text className="text-destructive text-sm">{t('orders.refund')}</Text>
					<Text className="text-destructive text-sm tabular-nums">{format(-refunded)}</Text>
				</View>
			) : null}
		</Section>
	);
}
