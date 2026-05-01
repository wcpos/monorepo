import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { Text } from '@wcpos/components/text';

import { formatDate, formatTime } from './_format';
import { StatusPill } from './_status-pill';

type OrderDocument = import('@wcpos/database').OrderDocument;

function getMetaValue(metaData: { key?: string; value?: unknown }[] | undefined, key: string) {
	const value = metaData?.find((item) => item.key === key)?.value;
	return value == null || value === '' ? undefined : String(value);
}

function totalRefunded(order: OrderDocument) {
	return (order.refunds || []).reduce((sum, refund) => {
		const total = parseFloat(String(refund.total ?? '0'));
		return Number.isFinite(total) ? sum + Math.abs(total) : sum;
	}, 0);
}

interface Props {
	order: OrderDocument;
	onPrintReceipt?: () => void;
	onRefund?: () => void;
}

export function HeaderSection({ order, onPrintReceipt, onRefund }: Props) {
	const refundedAmount = totalRefunded(order);
	const isPartialRefund =
		refundedAmount > 0 && refundedAmount < parseFloat(String(order.total ?? '0'));
	const status = isPartialRefund ? 'partially-refunded' : order.status;

	const cashier = getMetaValue(order.meta_data, '_pos_user');
	const store = getMetaValue(order.meta_data, '_pos_store');
	const paymentMethod = order.payment_method_title || order.payment_method;

	const currency = order.currency_symbol ?? '';
	const total = parseFloat(String(order.total ?? '0'));
	const totalDisplay = Number.isFinite(total) ? total.toFixed(2) : String(order.total ?? '');

	return (
		<View className="border-border bg-card border-b px-5 pt-5 pb-5 md:px-6 md:pt-6 md:pb-5">
			{/* Eyebrow row: order number + via */}
			<View className="mb-3 flex-row items-center gap-2 pr-8">
				<Text className="text-muted-foreground text-xs">Order</Text>
				<Text className="text-foreground text-xs font-medium">
					#{order.number || order.id || '—'}
				</Text>
				{order.created_via ? (
					<View className="bg-muted ml-1 rounded px-1.5 py-0.5">
						<Text className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
							via {order.created_via}
						</Text>
					</View>
				) : null}
			</View>

			{/* Hero row: amount + status pill | actions */}
			<View className="flex-row flex-wrap items-end justify-between gap-3">
				<View className="min-w-0 flex-1 gap-1.5">
					<View className="flex-row flex-wrap items-baseline gap-3">
						<Text className="text-foreground text-3xl font-semibold tracking-tight tabular-nums md:text-4xl">
							<Text className="text-muted-foreground font-medium">{currency}</Text>
							{totalDisplay}
						</Text>
						<StatusPill status={status} />
					</View>
					<HeroSubtitle
						order={order}
						cashier={cashier}
						store={store}
						paymentMethod={paymentMethod}
						refundedAmount={refundedAmount}
					/>
				</View>

				<View className="flex-row gap-2">
					{onPrintReceipt ? (
						<Button variant="outline" size="sm" onPress={onPrintReceipt} leftIcon="receipt">
							<ButtonText>Print receipt</ButtonText>
						</Button>
					) : null}
					{onRefund ? (
						<Button
							variant="outline-destructive"
							size="sm"
							onPress={onRefund}
							leftIcon="arrowRotateLeft"
						>
							<ButtonText>{refundedAmount > 0 ? 'Refund more' : 'Refund'}</ButtonText>
						</Button>
					) : null}
				</View>
			</View>
		</View>
	);
}

function HeroSubtitle({
	order,
	cashier,
	store,
	paymentMethod,
	refundedAmount,
}: {
	order: OrderDocument;
	cashier?: string;
	store?: string;
	paymentMethod?: string;
	refundedAmount: number;
}) {
	const parts: React.ReactNode[] = [];

	if (order.date_created) {
		parts.push(
			<Text key="date" className="text-muted-foreground text-xs">
				<Text className="text-foreground/80 text-xs font-medium">
					{formatDate(order.date_created)}
				</Text>
				{` · ${formatTime(order.date_created)}`}
			</Text>
		);
	}

	if (cashier) {
		parts.push(
			<Text key="cashier" className="text-muted-foreground text-xs">
				Cashier <Text className="text-foreground/80 text-xs font-medium">{cashier}</Text>
				{store ? (
					<Text className="text-muted-foreground text-xs">
						{' @ '}
						<Text className="text-foreground/80 text-xs font-medium">{store}</Text>
					</Text>
				) : null}
			</Text>
		);
	} else if (store) {
		parts.push(
			<Text key="store" className="text-muted-foreground text-xs">
				<Text className="text-foreground/80 text-xs font-medium">{store}</Text>
			</Text>
		);
	}

	if (paymentMethod) {
		const paid = order.date_paid ? ` at ${formatTime(order.date_paid)}` : '';
		parts.push(
			<Text key="payment" className="text-muted-foreground text-xs">
				Paid by <Text className="text-foreground/80 text-xs font-medium">{paymentMethod}</Text>
				{paid}
			</Text>
		);
	}

	if (refundedAmount > 0) {
		parts.push(
			<Text key="refunded" className="text-destructive text-xs font-medium">
				−{order.currency_symbol ?? ''}
				{refundedAmount.toFixed(2)} refunded
			</Text>
		);
	}

	if (!parts.length) return null;

	return (
		<View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
			{parts.map((part, index) => (
				<View key={index} className="flex-row items-center gap-2">
					{part}
					{index < parts.length - 1 ? (
						<View className="bg-muted-foreground/40 h-0.5 w-0.5 rounded-full" />
					) : null}
				</View>
			))}
		</View>
	);
}
