import * as React from 'react';
import { View } from 'react-native';

import toNumber from 'lodash/toNumber';

import { Text } from '@wcpos/components/text';

import { Section } from './_section';
import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type OrderDocument = import('@wcpos/database').OrderDocument;

function totalRefunded(order: OrderDocument) {
	return (order.refunds || []).reduce((sum, refund) => {
		const value = 'amount' in refund ? (refund.amount ?? refund.total) : refund.total;
		return sum + Math.abs(toNumber(value));
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
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol: order.currency_symbol });

	const subtotal = (order.line_items || []).reduce(
		(sum, item) => sum + toNumber(item.subtotal || item.total),
		0
	);
	const discount = toNumber(order.discount_total);
	const shipping = toNumber(order.shipping_total);
	const fees = (order.fee_lines || []).reduce((sum, fee) => sum + toNumber(fee.total), 0);
	const taxTotal = toNumber(order.total_tax);
	const refunded = totalRefunded(order);
	const total = toNumber(order.total);

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
		<Section title={t('orders.totals', { defaultValue: 'Totals' })}>
			<View className="gap-0.5">
				<Row label={t('common.subtotal')} value={format(subtotal)} />
				{discount > 0 ? (
					<Row
						label={
							<View className="flex-row items-center gap-2">
								<Text className="text-muted-foreground text-sm">
									{t('common.discount', { defaultValue: 'Discount' })}
								</Text>
								{couponLabel ? (
									<View className="bg-primary/10 rounded px-1.5 py-0.5">
										<Text className="text-primary text-[10px] font-medium tabular-nums">
											{couponLabel}
										</Text>
									</View>
								) : null}
							</View>
						}
						value={format(-discount)}
					/>
				) : null}
				{shippingLines.length || shipping > 0 ? (
					<Row
						label={
							<View className="flex-row items-center gap-2">
								<Text className="text-muted-foreground text-sm">{t('common.shipping')}</Text>
								{shippingMethod ? (
									<Text className="text-muted-foreground/80 text-xs">· {shippingMethod}</Text>
								) : null}
							</View>
						}
						value={format(shipping)}
					/>
				) : null}
				{fees > 0 ? <Row label={t('pos_cart.fees')} value={format(fees)} /> : null}
				{taxTotal > 0 || taxLines.length ? (
					<Row label={t('common.tax')} value={format(taxTotal)} />
				) : null}
				{taxLines.map((line, index) => {
					const subLabel =
						line.label && line.rate_percent != null
							? `${line.label} ${line.rate_percent}%`
							: line.label || `${t('common.tax')} ${line.id ?? index + 1}`;
					return (
						<View
							key={`${line.id ?? line.label ?? 'tax'}-${index}`}
							className="flex-row items-baseline justify-between gap-3 py-0.5 pl-3"
						>
							<Text className="text-muted-foreground/80 text-xs">{subLabel}</Text>
							<Text className="text-foreground/80 text-xs tabular-nums">
								{format(toNumber(line.tax_total))}
							</Text>
						</View>
					);
				})}
				{refunded > 0 ? (
					<Row label={t('orders.refund')} value={format(-refunded)} tone="destructive" />
				) : null}

				<View className="border-border mt-2 flex-row items-baseline justify-between gap-3 border-t pt-3">
					<Text className="text-foreground text-sm font-semibold">
						{refunded > 0 ? t('orders.net_payment') : t('common.total')}
					</Text>
					<Text className="text-foreground text-lg font-semibold tracking-tight tabular-nums">
						{format(total - refunded)}
					</Text>
				</View>
			</View>
		</Section>
	);
}
