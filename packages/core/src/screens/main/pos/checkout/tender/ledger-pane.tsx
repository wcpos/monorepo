import * as React from 'react';

import { EmptyState } from '@wcpos/components/empty-state';
import { AmountFigure } from '@wcpos/components/amount-figure';
import { HStack } from '@wcpos/components/hstack';
import { MoneyList } from '@wcpos/components/money-list';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import {
	correctionOf,
	isOfflineDeviceAuthorization,
	isSettledPaymentRow,
	samePaymentId,
	toMinor,
} from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';

import { statusLabel, statusVariant } from './labels';
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
				paid={flow.split.paidUnits}
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
	paid,
}: Pick<Props, 'lines' | 'format'> & {
	totalMinor: number;
	withTotal?: boolean;
	paid?: TenderFlow['split']['paidUnits'];
}) {
	const t = useT();
	return (
		<MoneyList>
			{lines.map((line, index) => (
				<MoneyList.Row
					key={`${line.name}-${index}`}
					label={`${line.quantity ?? 1} × ${line.name ?? ''}`}
					beside={
						line.id !== undefined && paid?.[line.id] ? (
							<StatusBadge
								variant="ok"
								label={t('pos_checkout.units_paid_of', {
									n: paid[line.id].units,
									total: line.quantity ?? 1,
									methods: paid[line.id].methods.join(' + '),
								})}
							/>
						) : null
					}
					amount={line.total ?? ''}
				/>
			))}
			{withTotal ? (
				<MoneyList.Total
					label={t('common.total')}
					amount={format(totalMinor)}
					amountTestID="checkout-order-total"
				/>
			) : null}
		</MoneyList>
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
			<AmountFigure
				testID="checkout-balance"
				size={compact ? 'headline' : 'hero'}
				eyebrow={partPaid ? t('pos_checkout.remaining') : t('common.total')}
			>
				{format(flow.balanceMinor)}
			</AmountFigure>
			{partPaid ? (
				<Text variant="help">
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
 * `legAction` draws a leg's own action (the order modal's Change tender); the checkout has none.
 * A tender correction's R- is bookkeeping and is never drawn (#3647).
 */
export function LedgerLegs({
	view,
	format,
	closing = false,
	legAction,
	storeTender,
}: {
	view: LedgerView;
	format: Props['format'];
	closing?: boolean;
	legAction?: (row: PaymentRow) => React.ReactNode;
	/** What the store took with no till record (`storeSettledTender`, #3755): drawn only with no rows. */
	storeTender?: { amountMinor: number; title: string };
}) {
	const t = useT();
	const { formatDate } = useLocalDate();
	const store = view.rows.length === 0 ? storeTender : undefined;
	const paidMinor = store ? store.amountMinor : view.paidMinor;
	const balanceMinor = store ? 0 : view.balanceMinor;
	const firstPending = view.rows.find((row) => row.status === 'pending');
	const settled = view.rows.filter(isSettledPaymentRow);
	const lastTime = settled.at(-1)?.events?.[0]?.t;
	// A zero balance with nothing settled (every leg failed or voided) is not paid.
	const paidInFull = balanceMinor === 0 && (settled.length > 0 || store !== undefined);
	const paidInFullText = lastTime
		? t('pos_checkout.paid_in_full_at', { time: formatDate(new Date(lastTime), 'p') })
		: t('pos_checkout.paid_in_full');

	const legs =
		view.rows.length === 0 && !store ? (
			view.invoiceSent ? (
				<Text testID="checkout-ledger-sent" variant="key" decodeHtml>
					{view.invoiceSent.destination
						? t('pos_checkout.invoice_sent_awaiting', { destination: view.invoiceSent.destination })
						: t('pos_checkout.invoice_sent_awaiting_customer')}
				</Text>
			) : (
				<EmptyState kind="empty" size="inline" title={t('pos_checkout.no_payments_yet')} />
			)
		) : (
			<VStack space="xs" testID="checkout-ledger">
				{store ? (
					<HStack className="border-border items-center justify-between gap-2 border-b py-2">
						<Text variant="subheading" className="flex-1" decodeHtml>
							{store.title}
						</Text>
						<Text className="text-sm tabular-nums">{format(store.amountMinor)}</Text>
					</HStack>
				) : null}
				{view.rows.map((row, index) =>
					row.reverses ? null : (
						<LedgerLeg
							key={row.id}
							index={index}
							row={row}
							view={view}
							format={format}
							next={row === firstPending}
							action={legAction?.(row)}
						/>
					)
				)}
				{paidInFull && !closing ? (
					<Text className="text-success text-sm">{paidInFullText}</Text>
				) : null}
			</VStack>
		);

	if (!closing) return legs;

	return (
		<VStack space="xs">
			{legs}
			<MoneyList testID="checkout-ledger-totals" className="pt-2">
				<MoneyList.Row
					label={t('common.total')}
					amount={format(view.totalMinor)}
					amountTestID="checkout-order-total"
				/>
				<MoneyList.Row label={t('pos_checkout.paid')} amount={format(paidMinor)} />
				<MoneyList.Total
					label={paidInFull ? paidInFullText : t('pos_checkout.remaining')}
					tone={paidInFull ? 'ok' : 'default'}
					amount={paidInFull ? undefined : format(balanceMinor)}
					amountTestID="checkout-ledger-remaining"
				/>
				{/* Paid in full has no amount to show; the zero stays readable for the specs. */}
				{paidInFull ? (
					<Text testID="checkout-ledger-remaining" className="hidden">
						{format(balanceMinor)}
					</Text>
				) : null}
			</MoneyList>
		</VStack>
	);
}

function LedgerLeg({
	index,
	row,
	view,
	format,
	next,
	action,
}: {
	index: number;
	next: boolean;
	row: PaymentRow;
	view: LedgerView;
	format: (minor: number) => string;
	action?: React.ReactNode;
}) {
	const t = useT();
	const { formatDate } = useLocalDate();
	const time = row.events?.[0]?.t;
	const titleOf = (id: string) => view.tiles.find(({ method }) => method.id === id)?.method.title;
	const title = titleOf(row.method_id);
	// The original of a tender correction keeps its leg under a Corrected badge; its R+ names it.
	const corrected = correctionOf(row, view.rows) !== null;
	const original = row.corrects
		? view.rows.find(({ id }) => samePaymentId(id, row.corrects ?? ''))
		: undefined;
	// Only cash carries a tendered figure, and only then is change worth a line.
	const tendered =
		row.kind === 'cash' && row.tendered
			? {
					tendered: format(toMinor(row.tendered, view.dp)),
					change: format(toMinor(row.change ?? 0, view.dp)),
				}
			: null;
	// What the payment paid for, from its allocation: `1 Flat white, 1 Burger`.
	const paidFor = Object.entries(view.split.allocations[row.id] ?? {})
		.map(([id, units]) =>
			t('pos_checkout.units_of_name', {
				units,
				name: view.split.lines.find((line) => String(line.id) === id)?.name ?? '',
			})
		)
		.join(', ');
	// A cancelled payment stays listed, struck through (one way to cancel: the pane's disclosure).
	const voided = row.status === 'voided';

	return (
		<VStack space="xs" testID={`checkout-leg-${row.id}`} className="border-border border-b py-2">
			<HStack className="items-center justify-between gap-2">
				<Text variant="subheading" className={voided ? 'flex-1 line-through' : 'flex-1'} decodeHtml>
					{title ?? row.method_id}
				</Text>
				<Text className={voided ? 'text-sm tabular-nums line-through' : 'text-sm tabular-nums'}>
					{format(toMinor(row.amount, view.dp))}
				</Text>
				{voided ? (
					<Text variant="help" testID={`checkout-payment-${index}-cancelled`}>
						{t('pos_checkout.cancelled')}
					</Text>
				) : corrected ? (
					<StatusBadge
						testID={`checkout-leg-corrected-${row.id}`}
						label={t('orders.change_tender_corrected')}
						variant="muted"
					/>
				) : (
					<StatusBadge
						label={statusLabel(row.status, t, row.kind)}
						variant={statusVariant(row.status)}
					/>
				)}
			</HStack>
			{original ? (
				<Text variant="help" testID={`checkout-leg-corrected-from-${row.id}`} decodeHtml>
					{t('orders.change_tender_corrected_from', {
						method: titleOf(original.method_id) ?? original.method_id,
					})}
				</Text>
			) : null}
			{row.unverified === true ? (
				<Text variant="help" testID={`checkout-leg-recorded-manually-${row.id}`}>
					{t('orders.change_tender_recorded_manually')}
				</Text>
			) : null}
			{time ? (
				<Text variant="help" tabular>
					{formatDate(new Date(time), 'p')}
				</Text>
			) : null}
			{paidFor ? (
				<Text variant="help" decodeHtml>
					{paidFor}
				</Text>
			) : null}
			{next ? <Text variant="help">{t('pos_checkout.next_leg')}</Text> : null}
			{row.tip && toMinor(row.tip, view.dp) > 0 ? (
				<Text testID={`checkout-leg-tip-${row.id}`} variant="help">
					{t('pos_checkout.leg_tip', { amount: format(toMinor(row.tip, view.dp)) })}
				</Text>
			) : null}
			{tendered ? (
				<Text variant="help">{t('pos_checkout.leg_tendered_change', tendered)}</Text>
			) : null}
			{row.recorded_offline ? (
				<Text variant="help">
					{isOfflineDeviceAuthorization(row)
						? t('pos_checkout.settles_later')
						: t('pos_checkout.recorded_offline')}
				</Text>
			) : null}
			{action ? <HStack className="justify-end">{action}</HStack> : null}
		</VStack>
	);
}
