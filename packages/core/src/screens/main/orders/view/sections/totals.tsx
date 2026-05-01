import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';

import { formatMoney } from './_format';
import { Section } from './_section';

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

function Row({
	label,
	value,
	tone = 'default',
	indent,
}: {
	label: React.ReactNode;
	value: string;
	tone?: 'default' | 'destructive';
	indent?: boolean;
}) {
	const valueClass = tone === 'destructive' ? 'text-destructive' : 'text-foreground';
	const labelClass = tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground';
	return (
		<View className={`flex-row items-baseline justify-between gap-3 py-1 ${indent ? 'pl-3' : ''}`}>
			{typeof label === 'string' ? <Text className={`text-sm ${labelClass}`}>{label}</Text> : label}
			<Text className={`text-sm tabular-nums ${valueClass}`}>{value}</Text>
		</View>
	);
}

export function TotalsSection({ order }: { order: OrderDocument }) {
	const currency = order.currency_symbol;

	const subtotal = (order.line_items || []).reduce(
		(sum, item) => sum + asFloat(item.subtotal || item.total),
		0
	);
	const discount = asFloat(order.discount_total);
	const shipping = asFloat(order.shipping_total);
	const fees = (order.fee_lines || []).reduce((sum, fee) => sum + asFloat(fee.total), 0);
	const taxTotal = asFloat(order.total_tax);
	const refunded = totalRefunded(order);

	const couponLines = order.coupon_lines || [];
	const shippingLines = order.shipping_lines || [];
	const taxLines = order.tax_lines || [];

	const couponLabel = couponLines.length
		? couponLines
				.map((c) => c.code)
				.filter(Boolean)
				.join(', ')
		: undefined;
	const shippingMethod = shippingLines.length ? shippingLines[0]?.method_title : undefined;

	return (
		<Section title="Totals">
			<View className="gap-0.5">
				<Row label="Subtotal" value={formatMoney(subtotal, currency)} />
				{discount > 0 ? (
					<Row
						label={
							<View className="flex-row items-center gap-2">
								<Text className="text-muted-foreground text-sm">Discount</Text>
								{couponLabel ? (
									<View className="bg-primary/10 rounded px-1.5 py-0.5">
										<Text className="text-primary text-[10px] font-medium tabular-nums">
											{couponLabel}
										</Text>
									</View>
								) : null}
							</View>
						}
						value={formatMoney(-discount, currency)}
					/>
				) : null}
				{shippingLines.length || shipping > 0 ? (
					<Row
						label={
							<View className="flex-row items-center gap-2">
								<Text className="text-muted-foreground text-sm">Shipping</Text>
								{shippingMethod ? (
									<Text className="text-muted-foreground/80 text-xs">· {shippingMethod}</Text>
								) : null}
							</View>
						}
						value={formatMoney(shipping, currency)}
					/>
				) : null}
				{fees > 0 ? <Row label="Fees" value={formatMoney(fees, currency)} /> : null}
				{taxTotal > 0 || taxLines.length ? (
					<Row label="Tax" value={formatMoney(taxTotal, currency)} />
				) : null}
				{taxLines.map((line, index) => {
					const subLabel =
						line.label && line.rate_percent != null
							? `${line.label} ${line.rate_percent}%`
							: line.label || `Tax ${line.id ?? index + 1}`;
					return (
						<View
							key={`${line.id ?? line.label ?? 'tax'}-${index}`}
							className="flex-row items-baseline justify-between gap-3 py-0.5 pl-3"
						>
							<Text className="text-muted-foreground/80 text-xs">{subLabel}</Text>
							<Text className="text-foreground/80 text-xs tabular-nums">
								{formatMoney(line.tax_total, currency)}
							</Text>
						</View>
					);
				})}
				{refunded > 0 ? (
					<Row label="Refunded" value={formatMoney(-refunded, currency)} tone="destructive" />
				) : null}

				<View className="border-border mt-2 flex-row items-baseline justify-between gap-3 border-t pt-3">
					<Text className="text-foreground text-sm font-semibold">
						{refunded > 0 ? 'Net total' : 'Total'}
					</Text>
					<Text className="text-foreground text-lg font-semibold tracking-tight tabular-nums">
						{formatMoney(asFloat(order.total) - refunded, currency)}
					</Text>
				</View>
			</View>
		</Section>
	);
}
