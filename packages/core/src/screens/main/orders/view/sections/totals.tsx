import * as React from 'react';
import { View } from 'react-native';

import toNumber from 'lodash/toNumber';

import { MoneyList } from '@wcpos/components/money-list';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { Section } from './_section';
import { totalRefunded } from './total-refunded';
import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

type OrderPayload = EngineRecord<'orders'>['payload'];

export function TotalsSection({ order }: { order: OrderPayload }) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol: order.currency_symbol });

	const subtotal = (order.line_items || []).reduce(
		(sum, item) => sum + toNumber(item.subtotal ?? item.total),
		0
	);
	const discount = toNumber(order.discount_total);
	const shipping = toNumber(order.shipping_total);
	const fees = (order.fee_lines || []).reduce((sum, fee) => sum + toNumber(fee.total), 0);
	const taxTotal = toNumber(order.total_tax);
	const refunded = totalRefunded(order.refunds);
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
		<Section title={t('orders.totals')}>
			<MoneyList>
				<MoneyList.Row label={t('common.subtotal')} amount={format(subtotal)} />
				{discount > 0 ? (
					<MoneyList.Row
						label={t('common.discount')}
						beside={
							couponLabel ? (
								<View className="bg-primary/10 rounded px-1.5 py-0.5">
									<Text className="text-primary text-xs font-medium tabular-nums">
										{couponLabel}
									</Text>
								</View>
							) : null
						}
						amount={format(-discount)}
					/>
				) : null}
				{shippingLines.length || shipping > 0 ? (
					<MoneyList.Row
						label={t('common.shipping')}
						beside={shippingMethod ? <Text variant="help">· {shippingMethod}</Text> : null}
						amount={format(shipping)}
					/>
				) : null}
				{fees > 0 ? <MoneyList.Row label={t('pos_cart.fees')} amount={format(fees)} /> : null}
				{taxTotal > 0 || taxLines.length ? (
					<MoneyList.Row label={t('common.tax')} amount={format(taxTotal)} />
				) : null}
				{taxLines.map((line, index) => (
					<MoneyList.Row
						key={`${line.id ?? line.label ?? 'tax'}-${index}`}
						indent
						label={
							line.label && line.rate_percent != null
								? `${line.label} ${line.rate_percent}%`
								: line.label || `${t('common.tax')} ${line.id ?? index + 1}`
						}
						amount={format(toNumber(line.tax_total))}
					/>
				))}
				{refunded > 0 ? (
					<MoneyList.Row tone="bad" label={t('orders.refund')} amount={format(-refunded)} />
				) : null}
				<MoneyList.Total
					label={refunded > 0 ? t('orders.net_payment') : t('common.total')}
					amount={format(total - refunded)}
				/>
			</MoneyList>
		</Section>
	);
}
