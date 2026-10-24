import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { IconButton } from '@wcpos/components/icon-button';
import { HStack } from '@wcpos/components/hstack';
import { SegmentedControl } from '@wcpos/components/segmented-control';
import { Text } from '@wcpos/components/text';
import { fromMinor } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useTenderFlow } from '../tender/use-tender-flow';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useCheckoutBack } from './use-checkout-back';
import { leaveCheckout } from '../checkout-mode';
import { CancelPaymentView } from '../tender/cancel-payment-view';
import { LegacyTab } from '../tender/legacy-tab';
import { gatesCheckout, TenderPane, UnansweredGate } from '../tender/tender-pane';
import { useT } from '../../../../../contexts/translations';
import { StorageOutageBanner } from '../../components/storage-outage-banner';
import { TotalsChangedBanner } from '../../cart/totals-changed-banner';

export function CheckoutColumn({ order }: { order: EngineRecord<'orders'> }) {
	// The POS screen's overlays paint in its "pos" host, as the cart's confirmations do.
	const flow = useTenderFlow(order, 'columns', { portalHost: 'pos' });
	const payload = useRecordField(order, (record) => record.payload);
	const { format: formatCurrency } = useCurrencyFormat({ currencySymbol: payload.currency_symbol });
	const format = React.useCallback(
		(minor: number) => formatCurrency(Number(fromMinor(minor, flow.dp))),
		[formatCurrency, flow.dp]
	);
	const t = useT();
	const back = React.useCallback(() => {
		if (flow.state.splitView) flow.dispatch({ type: 'close-split' });
		else if (flow.hasLiveLeg && !flow.hasLiveTerminalLeg) flow.dispatch({ type: 'request-cancel' });
		else leaveCheckout(order.uuid);
	}, [flow, order.uuid]);
	useCheckoutBack(back);
	const body = (() => {
		if (gatesCheckout(flow)) return <UnansweredGate flow={flow} />;
		// A live terminal leg is never hidden behind another view: the pane below
		// shows it (with its own Cancel) until the server says the leg is over.
		if (flow.state.view === 'cancel' && !flow.hasLiveTerminalLeg) {
			return <CancelPaymentView flow={flow} format={format} />;
		}
		if (flow.state.tab === 'legacy') {
			return <LegacyTab flow={flow} order={order} receiptHost="stage" />;
		}
		if (flow.totalMinor === 0 && flow.balanceMinor === 0) {
			return (
				<View className="p-4">
					<Button
						// The sale button: primary, never green (green is a status colour, not an action).
						size="lg"
						testID="checkout-complete-order"
						loading={flow.running === 'takeTender'}
						disabled={flow.busy}
						onPress={() => void flow.takeTender()}
					>
						<ButtonText>{t('common.done')}</ButtonText>
					</Button>
				</View>
			);
		}
		return <TenderPane flow={flow} format={format} />;
	})();

	return (
		<View testID="checkout-tender-pane" className="bg-card flex-1">
			<Text testID="checkout-server-order-id" className="hidden">
				{payload.id}
			</Text>
			<HStack className="items-center gap-3 p-2">
				<SegmentedControl
					value={flow.state.tab}
					onValueChange={(tab) => flow.dispatch({ type: 'set-tab', tab: tab as 'payments' })}
					segments={[
						{
							value: 'payments',
							label: t('pos_checkout.payments_tab'),
							testID: 'checkout-tab-payments',
						},
						{ value: 'legacy', label: t('pos_checkout.legacy_tab'), testID: 'checkout-tab-legacy' },
					]}
				/>
				{flow.saveState?.kind === 'saving' && !payload.number ? (
					<View className="bg-muted h-5 w-40 rounded" testID="checkout-title-skeleton" />
				) : null}
				<View className="flex-1" />
				{flow.hasLiveLeg && !flow.hasLiveTerminalLeg && flow.state.view !== 'cancel' ? (
					<Button
						variant="outline-destructive"
						size="sm"
						testID="checkout-cancel-payment"
						// The flow drops every action while a payment is in progress; the button says so.
						disabled={flow.busy}
						onPress={() => flow.dispatch({ type: 'request-cancel' })}
					>
						<ButtonText>{t('pos_checkout.cancel_payment')}</ButtonText>
					</Button>
				) : null}
				<IconButton
					name="close"
					accessibilityLabel={t('common.close')}
					testID="checkout-close"
					onPress={back}
				/>
			</HStack>
			<View className="px-3">
				<TotalsChangedBanner orderId={order.uuid} testID="checkout-totals-changed-banner" />
				<StorageOutageBanner testID="checkout-storage-unavailable" />
			</View>
			<View className="flex-1 p-4">{body}</View>
			{flow.confirmDialog}
		</View>
	);
}
