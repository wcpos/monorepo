import * as React from 'react';
import { View } from 'react-native';

import { Card, CardContent, CardHeader, CardTitle } from '@wcpos/components/card';
import { Text } from '@wcpos/components/text';

type OrderDocument = import('@wcpos/database').OrderDocument;

function formatDate(value?: string | null) {
	if (!value) return '—';
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, {
				dateStyle: 'medium',
				timeStyle: 'short',
			}).format(date);
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
	return (
		<View className="gap-1">
			<Text className="text-muted-foreground text-xs uppercase">{label}</Text>
			<Text>{value ?? '—'}</Text>
		</View>
	);
}

export function PaymentSection({ order }: { order: OrderDocument }) {
	if (
		!order.date_paid &&
		!order.payment_method_title &&
		!order.payment_method &&
		!order.transaction_id
	) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Payment</CardTitle>
			</CardHeader>
			<CardContent className="flex-row flex-wrap gap-6">
				<Row label="Method" value={order.payment_method_title || order.payment_method} />
				<Row label="Transaction ID" value={order.transaction_id} />
				<Row label="Date paid" value={formatDate(order.date_paid)} />
			</CardContent>
		</Card>
	);
}
