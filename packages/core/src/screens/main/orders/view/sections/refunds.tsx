import * as React from 'react';
import { View } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';

import { formatDateTime } from './_format';
import { Section } from './_section';
import { WCRefund } from '../use-order-refunds';

type OrderDocument = import('@wcpos/database').OrderDocument;
type LocalRefund = NonNullable<OrderDocument['refunds']>[number];

function asFloat(value: unknown) {
	const n = parseFloat(String(value ?? '0'));
	return Number.isFinite(n) ? n : 0;
}

function formatNegative(value: unknown, currencySymbol?: string) {
	const num = Math.abs(asFloat(value));
	return `−${currencySymbol ?? ''}${num.toFixed(2)}`;
}

function refundTotal(refunds: WCRefund[] | LocalRefund[] | undefined) {
	return (refunds || []).reduce((sum, refund) => sum + Math.abs(asFloat(refund.total)), 0);
}

function RefundCard({ refund, currencySymbol }: { refund: WCRefund; currencySymbol?: string }) {
	const lineItems = refund.line_items || [];
	const reason = refund.reason || '';

	return (
		<View className="border-border bg-card overflow-hidden rounded-md border">
			{/* Head */}
			<View className="bg-destructive/5 border-border/60 flex-row items-start justify-between gap-3 border-b px-3 py-2.5">
				<View className="min-w-0 flex-1">
					<Text className="text-foreground text-xs font-medium tabular-nums">
						Refund #{refund.id || '—'}
					</Text>
					<Text className="text-muted-foreground text-xs">
						{formatDateTime(refund.date_created)}
					</Text>
				</View>
				<View className="items-end">
					<Text className="text-destructive text-sm font-semibold tabular-nums">
						{formatNegative(refund.amount ?? refund.total, currencySymbol)}
					</Text>
					{refund.refunded_by ? (
						<Text className="text-muted-foreground text-xs">By {refund.refunded_by}</Text>
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
							Item
						</Text>
						<Text className="text-muted-foreground w-8 text-right text-[10px] font-semibold tracking-wide uppercase">
							Qty
						</Text>
						<Text className="text-muted-foreground w-14 text-right text-[10px] font-semibold tracking-wide uppercase">
							Tax
						</Text>
						<Text className="text-muted-foreground w-16 text-right text-[10px] font-semibold tracking-wide uppercase">
							Total
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
								{currencySymbol ?? ''}
								{asFloat(item.total_tax).toFixed(2)}
							</Text>
							<Text className="text-foreground w-16 text-right text-xs tabular-nums">
								{currencySymbol ?? ''}
								{asFloat(item.total).toFixed(2)}
							</Text>
						</View>
					))}
				</View>
			) : null}
		</View>
	);
}

export function RefundsSkeleton() {
	return (
		<Section title="Refunds">
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
	return (
		<Section title="Refunds">
			<View className="gap-3">
				<Text className="text-destructive text-sm">Could not load refund details.</Text>
				{refunds?.length ? (
					<View className="gap-2">
						<Text className="text-muted-foreground text-xs">Local refund summary:</Text>
						{refunds.map((refund, index) => (
							<View key={`${refund.id || index}`} className="border-border rounded-md border p-3">
								<Text className="text-foreground text-xs font-medium">
									Refund #{refund.id || '—'}
								</Text>
								<Text className="text-muted-foreground text-xs">
									{refund.reason || 'No reason provided'}
								</Text>
								<Text className="text-destructive text-sm font-semibold tabular-nums">
									{formatNegative(refund.total, currencySymbol)}
								</Text>
							</View>
						))}
					</View>
				) : (
					<Text className="text-muted-foreground text-sm">
						No local refund summaries are available.
					</Text>
				)}
				<Button variant="outline" size="sm" onPress={onRetry} className="self-start">
					<ButtonText>Retry</ButtonText>
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
	const refunds = useObservableSuspense(resource);

	if (!refunds.length) return null;

	const total = refundTotal(refunds);

	return (
		<Section
			title="Refunds"
			right={
				<Text className="text-muted-foreground text-xs tabular-nums">
					{refunds.length} refund{refunds.length === 1 ? '' : 's'} ·{' '}
					{formatNegative(total, order.currency_symbol)}
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
