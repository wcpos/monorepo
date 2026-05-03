import * as React from 'react';
import { View } from 'react-native';

import toNumber from 'lodash/toNumber';

import { Text } from '@wcpos/components/text';
import { ModalHeader } from '@wcpos/components/modal';

import { StatusPill } from './_status-pill';
import { useT } from '../../../../../contexts/translations';
import { useCashierLabel } from '../../../hooks/use-cashier-label';
import { useStoreLabel } from '../../../hooks/use-store-label';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useDateFormat } from '../../../hooks/use-date-format';

type OrderDocument = import('@wcpos/database').OrderDocument;

function getMetaValue(metaData: { key?: string; value?: unknown }[] | undefined, key: string) {
	const value = metaData?.find((item) => item.key === key)?.value;
	return value == null || value === '' ? undefined : String(value);
}

function totalRefunded(order: OrderDocument) {
	return (order.refunds || []).reduce((sum, refund) => {
		const value = 'amount' in refund ? (refund.amount ?? refund.total) : refund.total;
		const total = parseFloat(String(value ?? '0'));
		return Number.isFinite(total) ? sum + Math.abs(total) : sum;
	}, 0);
}

interface Props {
	order: OrderDocument;
}

export function HeaderSection({ order }: Props) {
	const t = useT();
	const { format } = useCurrencyFormat({ currencySymbol: order.currency_symbol });
	const dateCreated = useDateFormat(order.date_created_gmt);
	const datePaid = useDateFormat(order.date_paid_gmt);

	const refundedAmount = totalRefunded(order);
	const total = toNumber(order.total);
	const isPartialRefund = refundedAmount > 0 && refundedAmount < total;
	const status = isPartialRefund ? 'partially-refunded' : order.status;

	const cashierID = getMetaValue(order.meta_data, '_pos_user');
	const cashier = useCashierLabel(cashierID).label;
	const storeID = getMetaValue(order.meta_data, '_pos_store');
	const store = useStoreLabel(storeID).label;
	const paymentMethod = order.payment_method_title || order.payment_method;

	return (
		<ModalHeader className="border-border border-b px-5 pt-5 pb-5">
			{/* Eyebrow row: order number + via */}
			<View className="mb-3 flex-row items-center gap-2 pr-8">
				<Text className="text-muted-foreground text-xs">{t('common.order')}</Text>
				<Text className="text-foreground text-xs font-medium">
					#{order.number || order.id || '—'}
				</Text>
				{order.created_via ? (
					<View className="bg-muted ml-1 rounded px-1.5 py-0.5">
						<Text className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
							{t('orders.via', { defaultValue: 'via' })} {order.created_via}
						</Text>
					</View>
				) : null}
			</View>

			{/* Hero row: amount + status pill */}
			<View className="flex-row flex-wrap items-end justify-between gap-3">
				<View className="min-w-0 flex-1 gap-1.5">
					<View className="flex-row flex-wrap items-baseline gap-3">
						<Text className="text-foreground text-4xl font-semibold tracking-tight tabular-nums">
							{format(total)}
						</Text>
						<StatusPill status={status} />
					</View>
					<HeroSubtitle
						dateCreated={dateCreated}
						datePaid={datePaid}
						cashier={cashier}
						store={store}
						paymentMethod={paymentMethod}
						refundedAmount={refundedAmount}
						formatMoney={format}
					/>
				</View>
			</View>
		</ModalHeader>
	);
}

function HeroSubtitle({
	dateCreated,
	datePaid,
	cashier,
	store,
	paymentMethod,
	refundedAmount,
	formatMoney,
}: {
	dateCreated: string | null;
	datePaid: string | null;
	cashier?: string;
	store?: string;
	paymentMethod?: string;
	refundedAmount: number;
	formatMoney: (value: number) => string;
}) {
	const t = useT();
	const parts: React.ReactNode[] = [];

	if (dateCreated) {
		parts.push(
			<Text key="date" className="text-foreground/80 text-xs font-medium">
				{dateCreated}
			</Text>
		);
	}

	if (cashier) {
		parts.push(
			<Text key="cashier" className="text-muted-foreground text-xs">
				{t('common.cashier')}{' '}
				<Text className="text-foreground/80 text-xs font-medium">{cashier}</Text>
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
			<Text key="store" className="text-foreground/80 text-xs font-medium">
				{store}
			</Text>
		);
	}

	if (paymentMethod) {
		parts.push(
			<Text key="payment" className="text-muted-foreground text-xs">
				{t('common.payment_method')}{' '}
				<Text className="text-foreground/80 text-xs font-medium">{paymentMethod}</Text>
				{datePaid ? (
					<Text className="text-muted-foreground text-xs">{` · ${datePaid}`}</Text>
				) : null}
			</Text>
		);
	}

	if (refundedAmount > 0) {
		parts.push(
			<Text key="refunded" className="text-destructive text-xs font-medium">
				{formatMoney(-refundedAmount)} {t('orders.refund').toLowerCase()}
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
