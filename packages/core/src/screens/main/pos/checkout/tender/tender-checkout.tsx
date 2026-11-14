import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { useIsPhone } from '@wcpos/components/lib/device';
import { HStack } from '@wcpos/components/hstack';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { fromMinor } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { leaveCheckout, useOrderCheckoutStage } from '../checkout-mode';
import { ReceiptStage } from '../receipt-stage/receipt-stage';
import { useFinishSale } from '../receipt-stage/use-finish-sale';
import { leaveOrCancel } from './checkout-body';
import { CancelPaymentButton, CheckoutBodyView, TenderTabs } from './checkout-body-view';
import { LedgerPane } from './ledger-pane';
import { TenderPane } from './tender-pane';
import { useTenderFlow } from './use-tender-flow';
import { useT } from '../../../../../contexts/translations';
import { useUISettings } from '../../../contexts/ui-settings';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { StorageOutageBanner } from '../../components/storage-outage-banner';
import { TotalsChangedBanner } from '../../cart/totals-changed-banner';
import { getUuidFromLineItem } from '../../hooks/utils';

interface Props {
	order: EngineRecord<'orders'>;
}

/**
 * The two-pane checkout (wcpos/roadmap#111, variant B): the order and its ledger
 * on the left like a receipt, the tenders and the keypad on the right. Below
 * tablet width the ledger collapses to a balance bar and the panes stack, so the
 * same flow works from a phone at a market stall to a desktop till.
 */
export function TenderCheckout({ order }: Props) {
	// The routed modal's confirmations paint at the root host, above it (as the refund form's).
	const flow = useTenderFlow(order, 'modal');
	const payload = useRecordField(order, (record) => record.payload);
	const { format: formatCurrency } = useCurrencyFormat({
		currencySymbol: payload.currency_symbol,
	});
	const router = useRouter();
	const t = useT();

	const compact = useIsPhone();
	const stage = useOrderCheckoutStage(order);
	const { uiSettings } = useUISettings('pos-cart');
	const finishSale = useFinishSale(order.uuid, 'modal');
	// Every figure in this modal is carried as minor units and only becomes a
	// display string here, so there is exactly one place a rounding rule applies.
	const format = React.useCallback(
		(minor: number) => formatCurrency(Number(fromMinor(minor, flow.dp))),
		[formatCurrency, flow.dp]
	);
	const leave = React.useCallback(() => {
		leaveCheckout(order.uuid);
		router.back();
	}, [router, order.uuid]);

	// The receipt stage finishes the sale; otherwise close is the shared back decision.
	const handleClose = React.useCallback(() => {
		if (stage === 'receipt') {
			finishSale();
			return;
		}
		leaveOrCancel(flow, { leave });
	}, [flow, leave, stage, finishSale]);

	const lines = React.useMemo(
		() =>
			(payload.line_items ?? []).map((item) => ({
				id: getUuidFromLineItem(item) ?? item.id,
				name: item.name,
				quantity: item.quantity,
				total: formatCurrency(Number(item.total ?? 0)),
			})),
		[payload.line_items, formatCurrency]
	);

	const body = (
		<CheckoutBodyView
			flow={flow}
			order={order}
			format={format}
			pane={
				compact ? (
					// The pane's own label row now carries the balance; no bar above it on a phone.
					<View className="bg-card flex-1 px-3">
						<TenderPane flow={flow} format={format} compact onLeave={leave} />
					</View>
				) : (
					<View className="flex-1 flex-row">
						<View className="border-border bg-muted/40 w-80 border-r p-4">
							<LedgerPane flow={flow} lines={lines} format={format} />
						</View>
						<View className="flex-1 p-4">
							<TenderPane flow={flow} format={format} onLeave={leave} />
						</View>
					</View>
				)
			}
		/>
	);

	if (stage === 'receipt' && uiSettings.autoShowReceipt) {
		return (
			<Dialog route onClose={handleClose}>
				<DialogContent testID="checkout-dialog" size="full" className="h-full">
					<DialogBody className="flex-1 px-0" contentContainerStyle={{ height: '100%' }}>
						<ReceiptStage orderUuid={order.uuid} compact />
					</DialogBody>
				</DialogContent>
			</Dialog>
		);
	}

	// The header row beside the title: hug, or Yoga hands the control the whole row.
	const tabs = <TenderTabs flow={flow} hug={!compact} className={compact ? 'flex-1' : undefined} />;
	const cancelPayment = <CancelPaymentButton flow={flow} size={compact ? undefined : 'sm'} />;

	return (
		<Dialog route onClose={handleClose}>
			<DialogContent testID="checkout-dialog" size={compact ? 'full' : '2xl'} className="h-full">
				<Text testID="checkout-server-order-id" className="hidden">
					{payload.id}
				</Text>
				<DialogHeader>
					<HStack className="items-center gap-3">
						<DialogTitle asChild>
							<Text className="text-foreground flex-1 text-lg font-semibold">
								{payload.number
									? t('pos_checkout.checkout_order', { orderNumber: payload.number })
									: t('pos_checkout.checkout')}
							</Text>
						</DialogTitle>
						{compact ? null : tabs}
						{compact ? null : cancelPayment}
					</HStack>
				</DialogHeader>
				<DialogBody className="flex-1 px-0" contentContainerStyle={{ flexGrow: 1 }}>
					<VStack space="sm" className="flex-1">
						{/* #163 R5 and the totals ruling both land here: this modal is the last
						    point before goods change hands, and it is the only screen in front
						    of the cashier once checkout is open. */}
						<View className="px-3">
							{/* On a phone the header is the title and the close; the switch gets a row. */}
							{compact ? (
								<HStack className="items-center gap-2 pb-2">
									{tabs}
									{cancelPayment}
								</HStack>
							) : null}
							<TotalsChangedBanner orderId={order.uuid} testID="checkout-totals-changed-banner" />
							<StorageOutageBanner testID="checkout-storage-unavailable" />
						</View>
						{body}
					</VStack>
				</DialogBody>
				{flow.confirmDialog}
			</DialogContent>
		</Dialog>
	);
}
