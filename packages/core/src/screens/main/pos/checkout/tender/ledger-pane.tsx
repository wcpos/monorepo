import * as React from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { HStack } from '@wcpos/components/hstack';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { toMinor } from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';

import { statusLabelKey, statusVariant } from './labels';
import { useT } from '../../../../../contexts/translations';

import type { LedgerView } from './use-ledger-view';
import type { TenderFlow } from './use-tender-flow';

interface OrderLine {
	id?: number;
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
	paidBy?: Record<number, string[]>;
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

/**
 * The phone form of the same pane. The lines and the order total are not what a
 * cashier needs mid-tender on a small screen — the balance is — so the bar shows
 * the balance and a payment count, and expands to the payments taken.
 */
export function BalanceBar({ flow, format }: Omit<Props, 'lines'>) {
	const t = useT();
	const count = flow.liveRows.length;

	return (
		<Collapsible className="border-border bg-muted/40 gap-2 rounded-md border p-3">
			<CollapsibleTrigger testID="checkout-balance-bar">
				<HStack className="flex-1 items-center justify-between">
					<BalanceHeadline flow={flow} format={format} compact />
					{count > 0 ? (
						<Text className="text-muted-foreground text-xs">
							{t('pos_checkout.payments_taken', { count })}
						</Text>
					) : null}
				</HStack>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<VStack space="sm">
					<LedgerLegs view={flow} format={format} />
				</VStack>
			</CollapsibleContent>
		</Collapsible>
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
			<Text className="text-muted-foreground text-xs tracking-wider uppercase">
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

export function LedgerLegs({ view, format }: { view: LedgerView; format: Props['format'] }) {
	const t = useT();

	if (view.rows.length === 0) {
		return (
			<Text className="text-muted-foreground text-sm">{t('pos_checkout.no_payments_yet')}</Text>
		);
	}

	return (
		<VStack space="xs" testID="checkout-ledger">
			{view.rows.map((row) => (
				<LedgerLeg key={row.id} row={row} view={view} format={format} />
			))}
		</VStack>
	);
}

function LedgerLeg({
	row,
	view,
	format,
}: {
	row: PaymentRow;
	view: LedgerView;
	format: (minor: number) => string;
}) {
	const t = useT();
	const title = view.tiles.find(({ method }) => method.id === row.method_id)?.method.title;
	// Only cash carries a tendered figure, and only then is change worth a line.
	const tendered = row.tendered
		? {
				tendered: format(toMinor(row.tendered, view.dp)),
				change: format(toMinor(row.change ?? 0, view.dp)),
			}
		: null;

	return (
		<VStack
			space="xs"
			testID={`checkout-leg-${row.id}`}
			className="border-border bg-background rounded-md border p-2"
		>
			<HStack className="items-center justify-between gap-2">
				<Text className="flex-1 text-sm font-medium" decodeHtml>
					{title ?? row.method_id}
				</Text>
				<Text className="text-sm tabular-nums">{format(toMinor(row.amount, view.dp))}</Text>
				<StatusBadge label={t(statusLabelKey(row.status))} variant={statusVariant(row.status)} />
			</HStack>
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
						row.capture_mode === 'device' && row.status === 'authorized'
							? 'pos_checkout.settles_later'
							: 'pos_checkout.recorded_offline'
					)}
				</Text>
			) : null}
		</VStack>
	);
}
