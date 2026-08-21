import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { RailSection } from './_section';
import { totalRefunded } from './total-refunded';
import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useDateFormat } from '../../../hooks/use-date-format';

type OrderPayload = EngineRecord<'orders'>['payload'];

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

export function PaymentSection({ order, last }: { order: OrderPayload; last?: boolean }) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol: order.currency_symbol });
	const datePaid = useDateFormat(order.date_paid_gmt);

	const method = order.payment_method_title || order.payment_method;
	const refunded = totalRefunded(order.refunds);

	if (!method && !order.transaction_id && !datePaid && refunded === 0) {
		return null;
	}

	return (
		<RailSection title={t('common.payment_method')} last={last}>
			<KV k={t('common.payment_method')} v={method} />
			<KV k={t('common.transaction_id')} v={order.transaction_id} />
			<KV k={t('orders.captured')} v={datePaid ?? undefined} />
			{refunded > 0 ? <KV k={t('orders.refund')} v={format(-refunded)} tone="destructive" /> : null}
		</RailSection>
	);
}
