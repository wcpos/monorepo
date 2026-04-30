import * as React from 'react';
import { View } from 'react-native';

import { Card, CardContent, CardHeader, CardTitle } from '@wcpos/components/card';
import { Text } from '@wcpos/components/text';

type OrderDocument = import('@wcpos/database').OrderDocument;

function formatMoney(value: unknown, currencySymbol?: string) {
	const num = typeof value === 'number' ? value : parseFloat(String(value ?? '0'));
	return Number.isFinite(num) ? `${currencySymbol ?? ''}${num.toFixed(2)}` : String(value ?? '—');
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<View className="flex-row justify-between gap-4">
			<Text className="text-muted-foreground">{label}</Text>
			<Text>{value}</Text>
		</View>
	);
}

export function TotalsSection({ order }: { order: OrderDocument }) {
	const feeTotal = (order.fee_lines || []).reduce(
		(sum, fee) => sum + (Number.parseFloat(String(fee.total || '0')) || 0),
		0
	);

	return (
		<Card>
			<CardHeader>
				<CardTitle>Totals</CardTitle>
			</CardHeader>
			<CardContent className="gap-2">
				<Row
					label="Subtotal"
					value={formatMoney(
						order.line_items?.reduce(
							(sum, item) =>
								sum + (Number.parseFloat(String(item.subtotal || item.total || '0')) || 0),
							0
						),
						order.currency_symbol
					)}
				/>
				<Row label="Discount" value={formatMoney(order.discount_total, order.currency_symbol)} />
				<Row label="Shipping" value={formatMoney(order.shipping_total, order.currency_symbol)} />
				<Row label="Fees" value={formatMoney(feeTotal, order.currency_symbol)} />
				<Row label="Tax" value={formatMoney(order.total_tax, order.currency_symbol)} />
				<View className="border-border mt-2 border-t pt-2">
					<Row label="Total" value={formatMoney(order.total, order.currency_symbol)} />
				</View>
			</CardContent>
		</Card>
	);
}
