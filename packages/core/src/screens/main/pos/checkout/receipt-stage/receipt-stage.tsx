import * as React from 'react';
import { View } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Icon } from '@wcpos/components/icon';
import { Text } from '@wcpos/components/text';
import { derive, readLedger } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useFinishSale } from './use-finish-sale';
import { useCheckoutBack } from '../column/use-checkout-back';
import { useEngineRecord } from '../../../hooks/use-engine-document';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import { ReceiptActions } from '../../../receipt/receipt-actions';
import { ReceiptBody } from '../../../receipt/receipt-body';
import { useReceiptDocument } from '../../../receipt/use-receipt-document';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';

export function ReceiptStage({ orderUuid, compact }: { orderUuid: string; compact: boolean }) {
	const resource = useEngineRecord('orders', orderUuid);
	const order = useObservableSuspense(resource);
	if (!order) throw new Error('Receipt order is not defined');
	return <ReceiptStageDocument key={orderUuid} order={order} compact={compact} />;
}

function ReceiptStageDocument({
	order,
	compact,
}: {
	order: EngineRecord<'orders'>;
	compact: boolean;
}) {
	const doc = useReceiptDocument({ order, autoPrintAllowed: true });
	const payload = useRecordField(order, (record) => record.payload);
	const { methods } = usePaymentMethods();
	const { store } = useStoreSession();
	const { format } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const t = useT();
	const rows = readLedger(payload.meta_data);
	const derived = derive(payload.total, rows, methods, {
		dp: store.price_num_decimals ?? 2,
	});
	// A split sale names every method that took money, in ledger order; `derive` only
	// reports the primary one.
	const methodTitles = Array.from(
		new Set(
			rows
				.filter((row) => row.status === 'captured')
				.map((row) => methods.find((method) => method.id === row.method_id)?.title ?? row.method_id)
		)
	);
	const paidWith =
		methodTitles.length > 0 ? methodTitles.join(' + ') : derived.payment_method_title;
	const finishSale = useFinishSale(order.uuid, compact);
	useCheckoutBack(finishSale, { escape: false });
	return (
		<View testID="checkout-receipt-stage" className="flex-1">
			<View testID="receipt-paid-banner" className="bg-success/10 gap-2 p-4">
				<HStack className="items-center gap-2">
					<Icon name="check" className="text-success" />
					<Text className="text-xl font-semibold">
						{t('pos_checkout.paid_amount', { amount: format(Number(derived.paid)) })}
					</Text>
				</HStack>
				<Text testID="receipt-paid-with">{paidWith}</Text>
				{Number(derived.change) > 0 ? (
					<View>
						<Text className="text-muted-foreground text-xs uppercase">
							{t('pos_checkout.change_due')}
						</Text>
						<Text testID="receipt-change-due" className="text-4xl font-bold tabular-nums">
							{format(Number(derived.change))}
						</Text>
					</View>
				) : null}
				{doc.printedTo ? (
					<Text testID="receipt-printed-to">
						{t('pos_checkout.printed_to', { printer: doc.printedTo })}
					</Text>
				) : null}
			</View>
			<View className="min-h-0 flex-1 p-3">
				<ReceiptBody doc={doc} selectsInline={!compact} />
			</View>
			<HStack
				className={`border-border items-center justify-between gap-2 border-t p-3 ${compact ? 'flex-wrap' : ''}`}
			>
				<HStack className="flex-1 flex-wrap gap-2">
					<Button
						variant="outline"
						className="shrink-0"
						testID="receipt-no-receipt"
						onPress={finishSale}
					>
						<ButtonText>{t('pos_checkout.no_receipt')}</ButtonText>
					</Button>
					<ReceiptActions doc={doc} order={order} buttonComponent={Button} />
				</HStack>
				<Button
					variant="success"
					size="lg"
					className={compact ? 'w-full' : 'shrink-0'}
					testID="receipt-new-sale"
					onPress={finishSale}
				>
					<ButtonText>{t('pos_checkout.new_sale')}</ButtonText>
				</Button>
			</HStack>
		</View>
	);
}
