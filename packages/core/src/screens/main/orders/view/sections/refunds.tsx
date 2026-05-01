import * as React from 'react';
import { View } from 'react-native';

import toNumber from 'lodash/toNumber';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';

import { Section } from './_section';
import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useDateFormat } from '../../../hooks/use-date-format';
import { WCRefund } from '../use-order-refunds';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LocalRefund = NonNullable<OrderDocument['refunds']>[number];

function refundTotal(refunds: WCRefund[] | LocalRefund[] | undefined) {
	return (refunds || []).reduce((sum, refund) => {
		const value = 'amount' in refund ? (refund.amount ?? refund.total) : refund.total;
		return sum + Math.abs(toNumber(value));
	}, 0);
}

function RefundCard({ refund, currencySymbol }: { refund: WCRefund; currencySymbol?: string }) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol });
	const date = useDateFormat(refund.date_created);
	const lineItems = refund.line_items || [];
	const reason = refund.reason || '';
	const amount = Math.abs(toNumber(refund.amount ?? refund.total));

	return (
		<View className="border-border bg-card overflow-hidden rounded-md border">
			{/* Head */}
			<View className="bg-destructive/5 border-border/60 flex-row items-start justify-between gap-3 border-b px-3 py-2.5">
				<View className="min-w-0 flex-1">
					<Text className="text-foreground text-xs font-medium tabular-nums">
						{t('orders.refund')} #{refund.id || '—'}
					</Text>
					{date ? <Text className="text-muted-foreground text-xs">{date}</Text> : null}
				</View>
				<View className="items-end">
					<Text className="text-destructive text-sm font-semibold tabular-nums">
						{format(-amount)}
					</Text>
					{refund.refunded_by ? (
						<Text className="text-muted-foreground text-xs">
							{t('orders.refunded_by', { defaultValue: 'By' })} {refund.refunded_by}
						</Text>
					) : null}
				</View>
			</View>

			{/* Reason */}
			{reason ? (
				<View className="border-border/60 border-b px-3 py-2">
					<Text className="text-foreground/80 text-xs italic">&ldquo;{reason}&rdquo;</Text>
				</View>
			) : null}

			{/* Refunded line items */}
			{lineItems.length ? (
				<View className="px-3 py-2">
					<View className="border-border/40 flex-row items-baseline gap-2 border-b pb-1">
						<Text className="text-muted-foreground flex-1 text-[10px] font-semibold tracking-wide uppercase">
							{t('common.product', { defaultValue: 'Item' })}
						</Text>
						<Text className="text-muted-foreground w-8 text-right text-[10px] font-semibold tracking-wide uppercase">
							{t('common.quantity', { defaultValue: 'Qty' })}
						</Text>
						<Text className="text-muted-foreground w-14 text-right text-[10px] font-semibold tracking-wide uppercase">
							{t('common.tax')}
						</Text>
						<Text className="text-muted-foreground w-16 text-right text-[10px] font-semibold tracking-wide uppercase">
							{t('common.total')}
						</Text>
					</View>
					{lineItems.map((item, index) => (
						<View
							key={`${item.id || item.name || index}`}
							className="flex-row items-baseline gap-2 py-1"
						>
							<View className="flex-1 flex-row flex-wrap items-center gap-2">
								<Text className="text-foreground text-xs">{item.name || '—'}</Text>
								{item.sku ? (
									<View className="bg-primary/10 rounded px-1 py-0.5">
										<Text className="text-primary text-[10px] font-medium tabular-nums">
											{item.sku}
										</Text>
									</View>
								) : null}
							</View>
							<Text className="text-muted-foreground w-8 text-right text-xs tabular-nums">
								{item.quantity ?? '—'}
							</Text>
							<Text className="text-muted-foreground w-14 text-right text-xs tabular-nums">
								{format(toNumber(item.total_tax))}
							</Text>
							<Text className="text-foreground w-16 text-right text-xs tabular-nums">
								{format(toNumber(item.total))}
							</Text>
						</View>
					))}
				</View>
			) : null}
		</View>
	);
}

export function RefundsSkeleton() {
	const t = useT();
	return (
		<Section title={t('orders.refunds', { defaultValue: 'Refunds' })}>
			<View className="gap-2">
				<View className="bg-muted h-4 w-1/3 rounded" />
				<View className="bg-muted h-4 w-2/3 rounded" />
			</View>
		</Section>
	);
}

export function RefundsFallback({
	refunds,
	currencySymbol,
	onRetry,
}: {
	refunds?: LocalRefund[];
	currencySymbol?: string;
	onRetry: () => void;
}) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol });
	return (
		<Section title={t('orders.refunds', { defaultValue: 'Refunds' })}>
			<View className="gap-3">
				<Text className="text-destructive text-sm">
					{t('orders.refunds_load_failed', { defaultValue: 'Could not load refund details.' })}
				</Text>
				{refunds?.length ? (
					<View className="gap-2">
						<Text className="text-muted-foreground text-xs">
							{t('orders.local_refund_summary', { defaultValue: 'Local refund summary:' })}
						</Text>
						{refunds.map((refund, index) => (
							<View key={`${refund.id || index}`} className="border-border rounded-md border p-3">
								<Text className="text-foreground text-xs font-medium">
									{t('orders.refund')} #{refund.id || '—'}
								</Text>
								<Text className="text-muted-foreground text-xs">
									{refund.reason ||
										t('orders.no_reason_provided', { defaultValue: 'No reason provided' })}
								</Text>
								<Text className="text-destructive text-sm font-semibold tabular-nums">
									{format(-Math.abs(toNumber(refund.total)))}
								</Text>
							</View>
						))}
					</View>
				) : (
					<Text className="text-muted-foreground text-sm">
						{t('orders.no_local_refund_summary', {
							defaultValue: 'No local refund summaries are available.',
						})}
					</Text>
				)}
				<Button variant="outline" size="sm" onPress={onRetry} className="self-start">
					<ButtonText>{t('common.retry', { defaultValue: 'Retry' })}</ButtonText>
				</Button>
			</View>
		</Section>
	);
}

function RefundsDetail({
	order,
	resource,
}: {
	order: OrderDocument;
	resource: ObservableResource<WCRefund[]>;
}) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol: order.currency_symbol });
	const refunds = useObservableSuspense(resource);

	if (!refunds.length) return null;

	const total = refundTotal(refunds);

	return (
		<Section
			title={t('orders.refunds', { defaultValue: 'Refunds' })}
			right={
				<Text className="text-muted-foreground text-xs tabular-nums">
					{refunds.length} {t('orders.refund').toLowerCase()}
					{refunds.length === 1 ? '' : 's'} · {format(-total)}
				</Text>
			}
		>
			<View className="gap-2">
				{refunds.map((refund, index) => (
					<RefundCard
						key={`${refund.id || index}`}
						refund={refund}
						currencySymbol={order.currency_symbol}
					/>
				))}
			</View>
		</Section>
	);
}

export function RefundsSection({
	order,
	resource,
}: {
	order: OrderDocument;
	resource?: ObservableResource<WCRefund[]>;
}) {
	if (!order.id || !resource) {
		return null;
	}
	return <RefundsDetail order={order} resource={resource} />;
}
