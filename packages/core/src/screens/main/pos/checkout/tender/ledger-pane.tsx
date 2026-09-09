import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@wcpos/components/collapsible';
import { HStack } from '@wcpos/components/hstack';
import { StatusBadge } from '@wcpos/components/status-badge';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { toMinor } from '@wcpos/order-math';
import type { PaymentRow } from '@wcpos/order-math';

import { statusLabelKey, statusVariant } from './labels';
import { evenSplitShareMinor } from './tender-state';
import { useT } from '../../../../../contexts/translations';

import type { LedgerView } from './use-ledger-view';
import type { TenderFlow } from './use-tender-flow';

interface OrderLine {
	name?: string;
	quantity?: number;
	total?: string;
}

interface Props {
	flow: TenderFlow;
	lines: OrderLine[];
	format: (minor: number) => string;
	/** Even splits offered beside the balance; the Square / Shopify convention. */
	splitWays?: readonly number[];
}

const SPLIT_WAYS = [2, 3, 4] as const;

/**
 * The receipt side of the checkout: what is being bought, what it comes to, what
 * has been taken so far, and what is still owed. It is read left-to-right as a
 * running account — the cashier should never have to add anything up themselves.
 */
export function LedgerPane({ flow, lines, format, splitWays = SPLIT_WAYS }: Props) {
	return (
		<VStack space="md" className="flex-1">
			<BalanceHeadline flow={flow} format={format} />
			<ThisPaymentLine flow={flow} format={format} splitWays={splitWays} />
			<LedgerLines lines={lines} totalMinor={flow.totalMinor} format={format} />
			<LedgerLegs view={flow} format={format} />
		</VStack>
	);
}

export function LedgerLines({
	lines,
	totalMinor,
	format,
	withTotal = true,
}: Pick<Props, 'lines' | 'format'> & { totalMinor: number; withTotal?: boolean }) {
	const t = useT();
	return (
		<VStack space="xs">
			{lines.map((line, index) => (
				<HStack key={`${line.name}-${index}`} className="items-start justify-between gap-2">
					<Text className="text-muted-foreground flex-1 text-sm" decodeHtml>
						{`${line.quantity ?? 1} × ${line.name ?? ''}`}
					</Text>
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
export function BalanceBar({
	flow,
	format,
	splitWays = SPLIT_WAYS,
}: Omit<Props, 'lines'> & { splitWays?: readonly number[] }) {
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
			<ThisPaymentLine flow={flow} format={format} splitWays={splitWays} compact />
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
			{tendered ? (
				<Text className="text-muted-foreground text-xs">
					{t('pos_checkout.leg_tendered_change', tendered)}
				</Text>
			) : null}
			{row.recorded_offline ? (
				<Text className="text-muted-foreground text-xs">{t('pos_checkout.recorded_offline')}</Text>
			) : null}
		</VStack>
	);
}

/**
 * Splitting is really just taking less than the balance, but a cashier asked to
 * split a bill four ways wants the word on the screen and the arithmetic done
 * for them — so the even shares sit next to the balance and pre-fill the next
 * tender rather than starting a separate mode.
 */
export function ThisPaymentLine({
	flow,
	format,
	compact,
	renderRow,
	splitWays = SPLIT_WAYS,
}: {
	flow: TenderFlow;
	format: (minor: number) => string;
	splitWays?: readonly number[];
	compact?: boolean;
	renderRow?: (row: React.ReactNode) => React.ReactNode;
}) {
	const t = useT();

	const { splitPlan: plan, customAmount, splitMenuOpen } = flow.state;

	const row =
		// While a terminal leg is live its view carries the amount; two figures would compete.
		flow.balanceMinor === 0 || flow.state.view === 'cancel' || flow.terminalLeg ? null : (
			<HStack className="flex-wrap items-center gap-2">
				<VStack space="xs">
					<Text className="text-muted-foreground text-xs">{t('pos_checkout.this_payment')}</Text>
					<Text
						testID="checkout-this-payment"
						className={
							compact ? 'text-lg font-semibold tabular-nums' : 'text-2xl font-semibold tabular-nums'
						}
					>
						{format(flow.thisPaymentMinor)}
					</Text>
				</VStack>
				<Button
					variant="ghost-primary"
					size="sm"
					testID="checkout-split-payment"
					onPress={() =>
						flow.dispatch({ type: splitMenuOpen ? 'close-split-menu' : 'open-split-menu' })
					}
				>
					<ButtonText>
						{plan
							? t('pos_checkout.split_ways_label', { ways: plan.ways })
							: t(customAmount ? 'pos_checkout.custom_amount' : 'pos_checkout.split')}
					</ButtonText>
				</Button>
			</HStack>
		);

	const menu =
		row && splitMenuOpen ? (
			<VStack space="xs" className="border-border rounded-md border p-2">
				<Text className="text-muted-foreground text-xs">
					{t('pos_checkout.split_the_balance', { amount: format(flow.balanceMinor) })}
				</Text>
				<View className="flex-row flex-wrap gap-2">
					{splitWays
						// A balance too small to split N ways offers no N: a zero share cannot be taken.
						.filter((ways) => evenSplitShareMinor(flow.balanceMinor, ways) > 0)
						.map((ways) => (
							<Button
								key={ways}
								variant="outline"
								size="sm"
								testID={`checkout-split-${ways}`}
								onPress={() =>
									flow.dispatch({
										type: 'set-split-plan',
										ways,
										shareMinor: evenSplitShareMinor(flow.balanceMinor, ways),
									})
								}
							>
								<ButtonText>
									{t('pos_checkout.split_n_ways', {
										ways,
										amount: format(evenSplitShareMinor(flow.balanceMinor, ways)),
									})}
								</ButtonText>
							</Button>
						))}
					<Button
						variant="outline"
						size="sm"
						testID="checkout-split-custom"
						onPress={() => flow.dispatch({ type: 'arm-custom-amount' })}
					>
						<ButtonText>{t('pos_checkout.enter_amount')}</ButtonText>
					</Button>
					{plan || customAmount ? (
						<Button
							variant="outline"
							size="sm"
							testID="checkout-split-clear"
							onPress={() =>
								flow.dispatch({ type: 'clear-split', balanceMinor: flow.balanceMinor })
							}
						>
							<ButtonText>
								{t('pos_checkout.no_split', { amount: format(flow.balanceMinor) })}
							</ButtonText>
						</Button>
					) : null}
					<Button
						variant="ghost-muted"
						size="sm"
						testID="checkout-split-close"
						onPress={() => flow.dispatch({ type: 'close-split-menu' })}
					>
						<ButtonText>{t('common.cancel')}</ButtonText>
					</Button>
				</View>
			</VStack>
		) : null;
	return (
		<>
			{renderRow ? renderRow(row) : row}
			{menu}
			{row && plan ? <PlanStrip flow={flow} format={format} /> : null}
			{row && customAmount && flow.state.view === 'amount' && flow.state.entryMinor > 0 ? (
				<Text testID="checkout-split-after" className="text-muted-foreground text-xs">
					{t('pos_checkout.after_this_payment', { amount: format(flow.afterThisPaymentMinor) })}
				</Text>
			) : null}
		</>
	);
}

function PlanStrip({ flow, format }: Pick<Props, 'flow' | 'format'>) {
	const t = useT();
	const plan = flow.state.splitPlan!;
	return (
		<VStack space="xs">
			<Text className="text-muted-foreground text-xs">
				{t('pos_checkout.payment_n_of', { n: plan.taken + 1, ways: plan.ways })}
			</Text>
			<HStack className="flex-wrap gap-2">
				{flow.splitLegs.map(({ minor, state }, index) => (
					<StatusBadge
						key={index}
						testID={`checkout-split-leg-${index}`}
						label={`${format(minor)}${state === 'done' ? ' ✓' : ''}`}
						variant={state === 'done' ? 'success' : state === 'now' ? 'default' : 'muted'}
						className={
							state === 'done'
								? 'border-success border'
								: state === 'now'
									? 'border-primary border'
									: 'border-border border border-dashed'
						}
					/>
				))}
			</HStack>
		</VStack>
	);
}
