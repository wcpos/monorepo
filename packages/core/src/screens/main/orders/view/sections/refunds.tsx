import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';
import toNumber from 'lodash/toNumber';

import { EmptyState } from '@wcpos/components/empty-state';
import { Card } from '@wcpos/components/card';
import { Button, ButtonText } from '@wcpos/components/button';
import { Notice } from '@wcpos/components/notice';
import { Text } from '@wcpos/components/text';
import { refundValue } from '@wcpos/order-math';
import type { EngineRecord, QueryHandle } from '@wcpos/query';
import { useQuerySnapshot } from '@wcpos/query/query-state';

import { Section } from './_section';
import { totalRefunded } from './total-refunded';
import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useDateFormat } from '../../../hooks/use-date-format';
import { WCRefund } from '../use-order-refunds';

type OrderPayload = EngineRecord<'orders'>['payload'];
type LocalRefund = NonNullable<OrderPayload['refunds']>[number];

function RefundCard({
	refund,
	currencySymbol,
	orderUuid,
}: {
	refund: WCRefund;
	currencySymbol?: string;
	orderUuid: string;
}) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol });
	const router = useRouter();
	const date = useDateFormat(refund.date_created);
	const lineItems = refund.line_items || [];
	const reason = refund.reason || '';
	const amount = refundValue(refund);

	return (
		<Card className="overflow-hidden">
			{/* Head */}
			<View className="bg-bad/5 border-border/60 flex-row items-start justify-between gap-3 border-b px-3 py-2.5">
				<View className="min-w-0 flex-1">
					<Text className="text-foreground text-xs font-medium tabular-nums">
						{t('orders.refund')} #{refund.id || '—'}
					</Text>
					{date ? <Text className="text-muted-foreground text-xs">{date}</Text> : null}
				</View>
				<View className="items-end">
					<Text className="text-bad text-sm font-semibold tabular-nums">{format(-amount)}</Text>
					{refund.refunded_by ? (
						<Text className="text-muted-foreground text-xs">
							{t('orders.refunded_by')} {refund.refunded_by}
						</Text>
					) : null}
					{refund.id != null && (
						<Button
							variant="ghost"
							size="sm"
							testID={`refund-receipt-button-${refund.id}`}
							onPress={() =>
								router.push({
									pathname: '/orders/receipt/[orderId]',
									params: { orderId: orderUuid, document: `refund:${refund.id}` },
								})
							}
						>
							<ButtonText>{t('common.receipt')}</ButtonText>
						</Button>
					)}
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
						<Text className="text-muted-foreground flex-1 text-xs font-medium tracking-wide uppercase">
							{t('common.product')}
						</Text>
						<Text className="text-muted-foreground w-8 text-right text-xs font-medium tracking-wide uppercase">
							{t('pos_cart.qty_abbrev')}
						</Text>
						<Text className="text-muted-foreground w-14 text-right text-xs font-medium tracking-wide uppercase">
							{t('common.tax')}
						</Text>
						<Text className="text-muted-foreground w-16 text-right text-xs font-medium tracking-wide uppercase">
							{t('common.total')}
						</Text>
					</View>
					{lineItems.map((item, index) => (
						<View
							key={`${item.id || item.name || index}`}
							className="flex-row items-baseline gap-2 py-1"
						>
							<View className="flex-1 flex-row flex-wrap items-center gap-2">
								<Text className="text-foreground text-xs" decodeHtml>
									{item.name || '—'}
								</Text>
								{item.sku ? (
									<View className="bg-primary/10 rounded px-1 py-0.5">
										<Text className="text-primary text-xs font-medium tabular-nums">
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
		</Card>
	);
}

export function RefundsSkeleton() {
	const t = useT();
	return (
		<Section title={t('orders.refunds')}>
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
		<Section title={t('orders.refunds')}>
			<View className="gap-3">
				<Notice
					tone="bad"
					title={t('orders.refunds_load_failed')}
					actions={[{ label: t('common.retry'), onPress: onRetry }]}
				/>
				{refunds?.length ? (
					<View className="gap-2">
						<Text className="text-muted-foreground text-xs">
							{t('orders.local_refund_summary')}
						</Text>
						{refunds.map((refund, index) => (
							<Card key={`${refund.id || index}`} padding="row">
								<Text className="text-foreground text-xs font-medium">
									{t('orders.refund')} #{refund.id || '—'}
								</Text>
								<Text className="text-muted-foreground text-xs">
									{refund.reason || t('orders.no_reason_provided')}
								</Text>
								<Text className="text-bad text-sm font-semibold tabular-nums">
									{format(-refundValue(refund))}
								</Text>
							</Card>
						))}
					</View>
				) : (
					<EmptyState kind="empty" size="inline" title={t('orders.no_local_refund_summary')} />
				)}
			</View>
		</Section>
	);
}

function RefundsDetail({
	order,
	orderUuid,
	handle,
}: {
	order: OrderPayload;
	orderUuid: string;
	handle: QueryHandle;
}) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol: order.currency_symbol });
	// Suspends on this section's own boundary while the order's handle has no answer: an order
	// switch is a new handle, so the previous order's refunds are never drawn under it.
	const { hits } = useQuerySnapshot(handle, ['hits']);
	// Already newest first: the read sorts on `date_created_gmt`.
	const refunds = hits.map(({ record }) => record.payload as WCRefund);

	if (!refunds.length) return null;

	const total = totalRefunded(refunds);

	return (
		<Section
			title={t('orders.refunds')}
			right={
				<Text className="text-muted-foreground text-xs tabular-nums">
					{t('orders.refund_count', { count: refunds.length })} · {format(-total)}
				</Text>
			}
		>
			<View className="gap-2">
				{refunds.map((refund, index) => (
					<RefundCard
						key={`${refund.id || index}`}
						refund={refund}
						orderUuid={orderUuid}
						currencySymbol={order.currency_symbol}
					/>
				))}
			</View>
		</Section>
	);
}

export function RefundsSection({
	order,
	orderUuid,
	handle,
}: {
	order: OrderPayload;
	orderUuid: string;
	handle?: QueryHandle;
}) {
	if (!order.id || !handle) {
		return null;
	}
	return <RefundsDetail order={order} orderUuid={orderUuid} handle={handle} />;
}
