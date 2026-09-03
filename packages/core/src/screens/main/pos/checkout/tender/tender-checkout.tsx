import * as React from 'react';
import { View } from 'react-native';

import { useRouter } from 'expo-router';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Tabs, TabsList, TabsTrigger } from '@wcpos/components/tabs';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { fromMinor } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { CancelPaymentView } from './cancel-payment-view';
import { LegacyTab } from './legacy-tab';
import { BalanceBar, LedgerPane } from './ledger-pane';
import { TenderPane } from './tender-pane';
import { useTenderFlow } from './use-tender-flow';
import { useT } from '../../../../../contexts/translations';
import { useTheme } from '../../../../../contexts/theme';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useStorageMoneyPathGuard } from '../../../hooks/use-storage-health';
import { TotalsChangedBanner } from '../../cart/totals-changed-banner';

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
	const { storageDegraded } = useStorageMoneyPathGuard();
	const router = useRouter();
	const t = useT();

	const compact = screenSize === 'sm';
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
		if (flow.hasLiveLeg && flow.state.view !== 'cancel') {
			flow.dispatch({ type: 'request-cancel' });
			return;
		}
		router.back();
	}, [flow, router]);

	const lines = React.useMemo(
		() =>
			(payload.line_items ?? []).map((item) => ({
				name: item.name,
				quantity: item.quantity,
				total: formatCurrency(Number(item.total ?? 0)),
			})),
		[payload.line_items, formatCurrency]
	);

	const body = (() => {
		if (flow.state.view === 'cancel') {
			return <CancelPaymentView flow={flow} format={format} />;
		}
		if (flow.state.tab === 'legacy') {
			return <LegacyTab flow={flow} order={order} />;
		}
		if (compact) {
			return (
				<VStack space="md" className="flex-1 px-3 pb-3">
					<BalanceBar flow={flow} format={format} />
					<TenderPane flow={flow} format={format} compact />
				</VStack>
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

	return (
		<Modal onClose={handleClose}>
			<ModalContent testID="checkout-dialog" size={compact ? 'full' : '2xl'} className="h-full">
				<ModalHeader>
					<HStack className="items-center gap-3">
						<ModalTitle asChild>
							<Text className="text-foreground flex-1 text-lg font-semibold">
								{payload.number
									? t('pos_checkout.checkout_order', { orderNumber: payload.number })
									: t('pos_checkout.checkout')}
							</Text>
						</ModalTitle>
						<Tabs
							value={flow.state.tab}
							onValueChange={(tab) => flow.dispatch({ type: 'set-tab', tab: tab as 'payments' })}
						>
							<TabsList>
								<TabsTrigger value="payments" testID="checkout-tab-payments">
									<Text>{t('pos_checkout.payments_tab')}</Text>
								</TabsTrigger>
								<TabsTrigger value="legacy" testID="checkout-tab-legacy">
									<Text>{t('pos_checkout.legacy_tab')}</Text>
								</TabsTrigger>
							</TabsList>
						</Tabs>
						{flow.hasLiveLeg && flow.state.view !== 'cancel' ? (
							<Button
								variant="ghost-destructive"
								size="sm"
								testID="checkout-cancel-payment"
								onPress={() => flow.dispatch({ type: 'request-cancel' })}
							>
								<ButtonText>{t('pos_checkout.cancel_payment')}</ButtonText>
							</Button>
						) : null}
					</HStack>
				</ModalHeader>
				<ModalBody className="flex-1 px-0" contentContainerStyle={{ flexGrow: 1 }}>
					<VStack space="sm" className="flex-1">
						{/* #163 R5 and the totals ruling both land here: this modal is the last
						    point before goods change hands, and it is the only screen in front
						    of the cashier once checkout is open. */}
						<View className="px-3">
							<TotalsChangedBanner orderId={order.uuid} testID="checkout-totals-changed-banner" />
							{storageDegraded ? (
								<View className="border-destructive bg-destructive/10 rounded-md border p-3">
									<Text testID="checkout-storage-unavailable" className="text-destructive">
										{t('pos_checkout.storage_unavailable')}
									</Text>
								</View>
							) : null}
						</View>
						{body}
					</VStack>
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}
