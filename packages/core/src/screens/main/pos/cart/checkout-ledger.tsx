import * as React from 'react';
import { ScrollView, View } from 'react-native';

import { Card, CardContent, CardHeader } from '@wcpos/components/card';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useLedgerView } from '../checkout/tender/use-ledger-view';
import { LedgerLegs, LedgerLines } from '../checkout/tender/ledger-pane';

export function CheckoutLedger({ order }: { order: EngineRecord<'orders'> }) {
	const view = useLedgerView(order);
	const { format } = view;
	const payload = useRecordField(order, (record) => record.payload);
	const { format: formatCurrency } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const { format: formatName } = useCustomerNameFormat();
	const t = useT();
	const lines = React.useMemo(
		() =>
			(payload.line_items ?? []).map((item) => ({
				name: item.name,
				quantity: item.quantity,
				total: formatCurrency(Number(item.total ?? 0)),
			})),
		[payload.line_items, formatCurrency]
	);
	return (
		<Card className="flex-1">
			<CardHeader className="bg-card-header p-2" testID="checkout-ledger-header">
				<Text className="font-semibold">{payload.number}</Text>
				<Text>{formatName({ ...payload.billing, customer_id: 0 })}</Text>
			</CardHeader>
			<CardContent className="border-border flex-1 border-t p-0">
				<ScrollView className="flex-1" contentContainerClassName="p-4">
					<LedgerLines lines={lines} totalMinor={view.totalMinor} format={format} />
					<LedgerLegs view={view} format={format} />
				</ScrollView>
				<View testID="checkout-ledger-totals" className="border-border gap-2 border-t p-4">
					<HStack className="justify-between">
						<Text>{t('common.total')}</Text>
						<Text>{format(view.totalMinor)}</Text>
					</HStack>
					<HStack className="justify-between">
						<Text>{t('pos_checkout.paid')}</Text>
						<Text>{format(view.paidMinor)}</Text>
					</HStack>
					<HStack className="justify-between">
						<Text className="font-bold">{t('pos_checkout.remaining')}</Text>
						<Text className="font-bold" testID="checkout-ledger-remaining">
							{format(view.balanceMinor)}
						</Text>
					</HStack>
				</View>
			</CardContent>
		</Card>
	);
}
