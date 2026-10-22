import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { SegmentedControl } from '@wcpos/components/segmented-control';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { fromMinor } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { releaseTender, useOrderCheckoutStage } from '../checkout-mode';
import { ReceiptStage } from '../receipt-stage/receipt-stage';
import { useFinishSale } from '../receipt-stage/use-finish-sale';
import { CancelPaymentView } from './cancel-payment-view';
import { LegacyTab } from './legacy-tab';
import { LedgerPane } from './ledger-pane';
import { offersZeroTotalDone, TenderPane } from './tender-pane';
import { useTenderFlow } from './use-tender-flow';
import { useT } from '../../../../../contexts/translations';
import { useTheme } from '../../../../../contexts/theme';
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
	const flow = useTenderFlow(order);
	const payload = useRecordField(order, (record) => record.payload);
	const { screenSize } = useTheme();
	const { format: formatCurrency } = useCurrencyFormat({
		currencySymbol: payload.currency_symbol,
	});
	const router = useRouter();
	const t = useT();

	const compact = screenSize === 'sm';
	const stage = useOrderCheckoutStage(order);
	const finishSale = useFinishSale(order.uuid, compact);
	// Every figure in this modal is carried as minor units and only becomes a
	// display string here, so there is exactly one place a rounding rule applies.
	const format = React.useCallback(
		(minor: number) => formatCurrency(Number(fromMinor(minor, flow.dp))),
		[formatCurrency, flow.dp]
	);

	// Closing on a half-paid order is the same decision as pressing Cancel
	// payment: money has been taken and something has to happen to it. Dropping
	// straight back to the cart would leave the cashier holding cash the order
	// still counts as paid.
	const handleClose = React.useCallback(() => {
		if (stage === 'receipt') {
			finishSale();
			return;
		}
		if (flow.state.splitView) {
			flow.dispatch({ type: 'close-split' });
			return;
		}
		if (flow.hasLiveLeg && !flow.hasLiveTerminalLeg) {
			if (flow.state.view !== 'cancel') flow.dispatch({ type: 'request-cancel' });
			return;
		}
		releaseTender(order.uuid);
		router.back();
	}, [flow, router, stage, finishSale, order.uuid]);

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

	const body = (() => {
		// A live terminal leg is never hidden behind another view: the pane below
		// shows it (with its own Cancel) until the server says the leg is over.
		if (flow.state.view === 'cancel' && !flow.hasLiveTerminalLeg) {
			return <CancelPaymentView flow={flow} format={format} />;
		}
		if (flow.state.tab === 'legacy' && !flow.terminalLeg) {
			return <LegacyTab flow={flow} order={order} />;
		}
		if (offersZeroTotalDone(flow)) {
			return (
				<View className="p-4">
					<Button
						// The sale button: primary, never green (green is a status colour, not an action).
						size="lg"
						testID="checkout-complete-order"
						loading={flow.busy}
						disabled={flow.busy}
						onPress={() => void flow.takeTender()}
					>
						<ButtonText>{t('common.done')}</ButtonText>
					</Button>
				</View>
			);
		}
		if (compact) {
			return (
				// The pane's own label row now carries the balance; no bar above it on a phone.
				<View className="bg-card flex-1 px-3">
					<TenderPane flow={flow} format={format} compact />
				</View>
			);
		}
		return (
			<View className="flex-1 flex-row">
				<View className="border-border bg-muted/40 w-80 border-r p-4">
					<LedgerPane flow={flow} lines={lines} format={format} />
				</View>
				<View className="flex-1 p-4">
					<TenderPane flow={flow} format={format} />
				</View>
			</View>
		);
	})();

	if (stage === 'receipt') {
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

	const tabs = (
		<SegmentedControl
			className={compact ? 'flex-1' : undefined}
			value={flow.state.tab}
			onValueChange={(tab) => flow.dispatch({ type: 'set-tab', tab: tab as 'payments' })}
			segments={[
				{
					value: 'payments',
					label: t('pos_checkout.payments_tab'),
					testID: 'checkout-tab-payments',
				},
				{
					value: 'legacy',
					label: t('pos_checkout.legacy_tab'),
					testID: 'checkout-tab-legacy',
				},
			]}
		/>
	);
	const cancelPayment =
		flow.hasLiveLeg && !flow.hasLiveTerminalLeg && flow.state.view !== 'cancel' ? (
			<Button
				variant="outline-destructive"
				size={compact ? undefined : 'sm'}
				testID="checkout-cancel-payment"
				onPress={() => flow.dispatch({ type: 'request-cancel' })}
			>
				<ButtonText>{t('pos_checkout.cancel_payment')}</ButtonText>
			</Button>
		) : null;

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
			</DialogContent>
		</Dialog>
	);
}
