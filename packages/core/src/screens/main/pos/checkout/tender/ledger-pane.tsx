import * as React from 'react';
import { View } from 'react-native';

import { HStack } from '@wcpos/components/hstack';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { isOfflineDeviceAuthorization, isSettledPaymentRow, toMinor } from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';

import { statusLabelKey, statusVariant } from './labels';
import { useLocalDate } from '../../../../../hooks/use-local-date';
import { useT } from '../../../../../contexts/translations';

import type { LedgerView } from './use-ledger-view';
import type { TenderLineId } from './tender-state';
import type { TenderFlow } from './use-tender-flow';

interface OrderLine {
	id?: TenderLineId;
	name?: string;
	quantity?: number;
	total?: string;
}

interface Props {
	flow: TenderFlow;
	lines: OrderLine[];
	format: (minor: number) => string;
}

/**
 * The receipt side of the checkout: what is being bought, what it comes to, what
 * has been taken so far, and what is still owed. It is read left-to-right as a
 * running account — the cashier should never have to add anything up themselves.
 */
export function LedgerPane({ flow, lines, format }: Props) {
	return (
		<VStack space="md" className="flex-1">
			<BalanceHeadline flow={flow} format={format} />
			<LedgerLines
				lines={lines}
				totalMinor={flow.totalMinor}
				format={format}
				paidBy={flow.linesPaidBy}
			/>
			<LedgerLegs view={flow} format={format} />
		</VStack>
	);
}

export function LedgerLines({
	lines,
	totalMinor,
	format,
	withTotal = true,
	paidBy,
}: Pick<Props, 'lines' | 'format'> & {
	totalMinor: number;
	withTotal?: boolean;
	paidBy?: Record<TenderLineId, string[]>;
}) {
	const t = useT();
	return (
		<VStack space="xs">
			{lines.map((line, index) => (
				<HStack key={`${line.name}-${index}`} className="items-start justify-between gap-2">
					<Text className="text-muted-foreground flex-1 text-sm" decodeHtml>
						{`${line.quantity ?? 1} × ${line.name ?? ''}`}
					</Text>
					{line.id !== undefined && paidBy?.[line.id] ? (
						<StatusBadge
							variant="success"
							label={t('pos_checkout.line_paid_by', { methods: paidBy[line.id].join(' + ') })}
						/>
					) : null}
					<Text className="text-sm tabular-nums">{line.total ?? ''}</Text>
				</HStack>
			))}
			{withTotal ? (
				<HStack className="border-border justify-between border-t pt-2">
					<Text className="font-semibold">{t('common.total')}</Text>
					<Text className="font-semibold tabular-nums" testID="checkout-order-total">
						{format(totalMinor)}
					</Text>
				</HStack>
			) : null}
		</VStack>
	);
}

export function BalanceHeadline({
	flow,
	format,
	compact,
}: {
	flow: TenderFlow;
	format: (minor: number) => string;
	compact?: boolean;
}) {
	const t = useT();
	const partPaid = flow.paidMinor > 0;

	return (
		<VStack space="xs">
			<Text className="text-muted-foreground text-xs tracking-wide uppercase">
				{partPaid ? t('pos_checkout.remaining') : t('common.total')}
			</Text>
			<Text
				testID="checkout-balance"
				className={compact ? 'text-2xl font-bold tabular-nums' : 'text-4xl font-bold tabular-nums'}
			>
				{format(flow.balanceMinor)}
			</Text>
			{partPaid ? (
				<Text className="text-muted-foreground text-xs">
					{t('pos_checkout.paid_of_total', {
						paid: format(flow.paidMinor),
						total: format(flow.totalMinor),
					})}
				</Text>
			) : null}
		</VStack>
	);
}

/**
 * The payments, one plain row per leg. `closing` ends the block with the cart's closing rows
 * (Total, Paid, then Remaining or "Paid in full" as the lead row): the stilled cart states
 * the balance once, here. The phone pane omits it; its `BalanceHeadline` is its closing.
 */
export function LedgerLegs({
	view,
	format,
	closing = false,
}: {
	view: LedgerView;
	format: Props['format'];
	closing?: boolean;
}) {
	const t = useT();
	const { formatDate } = useLocalDate();
	const firstPending = view.rows.find((row) => row.status === 'pending');
	const settled = view.rows.filter(isSettledPaymentRow);
	const lastTime = settled.at(-1)?.events?.[0]?.t;
	// A zero balance with nothing settled (every leg failed or voided) is not paid.
	const paidInFull = view.balanceMinor === 0 && settled.length > 0;
	const paidInFullText = lastTime
		? t('pos_checkout.paid_in_full_at', { time: formatDate(new Date(lastTime), 'p') })
		: t('pos_checkout.paid_in_full');

	const legs =
		view.rows.length === 0 ? (
			view.invoiceSent ? (
				<Text testID="checkout-ledger-sent" className="text-muted-foreground text-sm" decodeHtml>
					{view.invoiceSent.destination
						? t('pos_checkout.invoice_sent_awaiting', { destination: view.invoiceSent.destination })
						: t('pos_checkout.invoice_sent_awaiting_customer')}
				</Text>
			) : (
				<Text className="text-muted-foreground text-sm">{t('pos_checkout.no_payments_yet')}</Text>
			)
		) : (
			<VStack space="xs" testID="checkout-ledger">
				{view.rows.map((row) => (
					<LedgerLeg
						key={row.id}
						row={row}
						view={view}
						format={format}
						next={row === firstPending}
					/>
				))}
				{paidInFull && !closing ? (
					<Text className="text-success text-sm">{paidInFullText}</Text>
				) : null}
			</VStack>
		);

	if (!closing) return legs;

	return (
		<VStack space="xs">
			{legs}
			<View testID="checkout-ledger-totals" className="gap-2 pt-2">
				<HStack className="justify-between">
					<Text className="text-muted-foreground">{t('common.total')}</Text>
					<Text testID="checkout-order-total" className="tabular-nums">
						{format(view.totalMinor)}
					</Text>
				</HStack>
				<HStack className="justify-between">
					<Text className="text-muted-foreground">{t('pos_checkout.paid')}</Text>
					<Text className="tabular-nums">{format(view.paidMinor)}</Text>
				</HStack>
				<HStack className="border-border justify-between border-t pt-2">
					{paidInFull ? (
						<Text className="text-success font-bold">{paidInFullText}</Text>
					) : (
						<Text className="font-bold">{t('pos_checkout.remaining')}</Text>
					)}
					{/* Paid in full has no amount to show; the zero stays readable for the specs. */}
					<Text
						testID="checkout-ledger-remaining"
						className={paidInFull ? 'hidden' : 'font-bold tabular-nums'}
					>
						{format(view.balanceMinor)}
					</Text>
				</HStack>
			</View>
		</VStack>
	);
}

function LedgerLeg({
	row,
	view,
	format,
	next,
}: {
	next: boolean;
	row: PaymentRow;
	view: LedgerView;
	format: (minor: number) => string;
}) {
	const t = useT();
	const { formatDate } = useLocalDate();
	const time = row.events?.[0]?.t;
	const title = view.tiles.find(({ method }) => method.id === row.method_id)?.method.title;
	// Only cash carries a tendered figure, and only then is change worth a line.
	const tendered =
		row.kind === 'cash' && row.tendered
			? {
					tendered: format(toMinor(row.tendered, view.dp)),
					change: format(toMinor(row.change ?? 0, view.dp)),
				}
			: null;

	return (
		<VStack space="xs" testID={`checkout-leg-${row.id}`} className="border-border border-b py-2">
			<HStack className="items-center justify-between gap-2">
				<Text className="flex-1 text-sm font-medium" decodeHtml>
					{title ?? row.method_id}
				</Text>
				<Text className="text-sm tabular-nums">{format(toMinor(row.amount, view.dp))}</Text>
				<StatusBadge label={t(statusLabelKey(row.status))} variant={statusVariant(row.status)} />
			</HStack>
			{time ? (
				<Text className="text-muted-foreground text-xs tabular-nums">
					{formatDate(new Date(time), 'p')}
				</Text>
			) : null}
			{next ? (
				<Text className="text-muted-foreground text-xs">{t('pos_checkout.next_leg')}</Text>
			) : null}
			{row.tip && toMinor(row.tip, view.dp) > 0 ? (
				<Text testID={`checkout-leg-tip-${row.id}`} className="text-muted-foreground text-xs">
					{t('pos_checkout.leg_tip', { amount: format(toMinor(row.tip, view.dp)) })}
				</Text>
			) : null}
			{tendered ? (
				<Text className="text-muted-foreground text-xs">
					{t('pos_checkout.leg_tendered_change', tendered)}
				</Text>
			) : null}
			{row.recorded_offline ? (
				<Text className="text-muted-foreground text-xs">
					{t(
						isOfflineDeviceAuthorization(row)
							? 'pos_checkout.settles_later'
							: 'pos_checkout.recorded_offline'
					)}
				</Text>
			) : null}
		</VStack>
	);
}
