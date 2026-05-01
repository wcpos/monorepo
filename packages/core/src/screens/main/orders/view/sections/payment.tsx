import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { formatTime } from './_format';
import { RailSection } from './_section';

type OrderDocument = import('@wcpos/database').OrderDocument;

function asFloat(value: unknown) {
	const n = parseFloat(String(value ?? '0'));
	return Number.isFinite(n) ? n : 0;
}

function totalRefunded(order: OrderDocument) {
	return (order.refunds || []).reduce((sum, refund) => {
		const total = asFloat(refund.total);
		return sum + Math.abs(total);
	}, 0);
}

function KV({
	k,
	v,
	tone = 'default',
}: {
	k: string;
	v?: React.ReactNode;
	tone?: 'default' | 'destructive';
}) {
	if (v == null || v === '') return null;
	const valueClass = tone === 'destructive' ? 'text-destructive' : 'text-foreground';
	return (
		<View className="flex-row items-baseline justify-between gap-3 py-1">
			<Text className="text-muted-foreground text-xs">{k}</Text>
			{typeof v === 'string' ? <Text className={`text-xs font-medium ${valueClass}`}>{v}</Text> : v}
		</View>
	);
}

export function PaymentSection({ order, last }: { order: OrderDocument; last?: boolean }) {
	const method = order.payment_method_title || order.payment_method;
	const refunded = totalRefunded(order);

	if (!method && !order.transaction_id && !order.date_paid && refunded === 0) {
		return null;
	}

	return (
		<RailSection title="Payment" last={last}>
			<KV k="Method" v={method} />
			<KV k="Transaction ID" v={order.transaction_id} />
			<KV k="Captured" v={order.date_paid ? formatTime(order.date_paid) : undefined} />
			{refunded > 0 ? (
				<KV
					k="Refunded"
					v={`−${order.currency_symbol ?? ''}${refunded.toFixed(2)}`}
					tone="destructive"
				/>
			) : null}
		</RailSection>
	);
}
