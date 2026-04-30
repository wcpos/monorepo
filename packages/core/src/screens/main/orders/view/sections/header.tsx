import * as React from 'react';
import { View } from 'react-native';

import { Card, CardContent, CardHeader, CardTitle } from '@wcpos/components/card';
import { Text } from '@wcpos/components/text';

type OrderDocument = import('@wcpos/database').OrderDocument;

function formatMoney(value: unknown, currencySymbol?: string) {
	const num = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
	return Number.isFinite(num) ? `${currencySymbol ?? ''}${num.toFixed(2)}` : String(value ?? '—');
}

function formatDate(value?: string | null) {
	if (!value) return '—';
	const date = new Date(value);
	return Number.isNaN(date.getTime())
		? value
		: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function customerName(order: OrderDocument) {
	const name = [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(' ');
	return name || order.billing?.company || order.billing?.email || 'Guest';
}

export function HeaderSection({ order }: { order: OrderDocument }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Order #{order.number || order.id || '—'}</CardTitle>
			</CardHeader>
			<CardContent className="gap-3">
				<View className="flex-row flex-wrap gap-6">
					<View className="gap-1">
						<Text className="text-muted-foreground text-xs uppercase">Status</Text>
						<Text className="capitalize">{order.status || '—'}</Text>
					</View>
					<View className="gap-1">
						<Text className="text-muted-foreground text-xs uppercase">Date created</Text>
						<Text>{formatDate(order.date_created)}</Text>
					</View>
					<View className="gap-1">
						<Text className="text-muted-foreground text-xs uppercase">Customer</Text>
						<Text>{customerName(order)}</Text>
					</View>
					<View className="gap-1">
						<Text className="text-muted-foreground text-xs uppercase">Total</Text>
						<Text className="font-semibold">{formatMoney(order.total, order.currency_symbol)}</Text>
					</View>
				</View>
			</CardContent>
		</Card>
	);
}
