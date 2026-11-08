import * as React from 'react';
import { View } from 'react-native';

import { IconButton } from '@wcpos/components/icon-button';
import { HStack } from '@wcpos/components/hstack';
import { Skeleton } from '@wcpos/components/skeleton';
import { Text } from '@wcpos/components/text';
import { fromMinor } from '@wcpos/order-math';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useTenderFlow } from '../tender/use-tender-flow';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { useCheckoutBack } from './use-checkout-back';
import { leaveCheckout } from '../checkout-mode';
import { leaveOrCancel } from '../tender/checkout-body';
import { CancelPaymentButton, CheckoutBodyView, TenderTabs } from '../tender/checkout-body-view';
import { TenderPane } from '../tender/tender-pane';
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
	const leave = React.useCallback(() => leaveCheckout(order.uuid), [order.uuid]);
	const back = React.useCallback(() => leaveOrCancel(flow, { leave }), [flow, leave]);
	useCheckoutBack(back);

	return (
		<View testID="checkout-tender-pane" className="bg-card flex-1">
			<Text testID="checkout-server-order-id" className="hidden">
				{payload.id}
			</Text>
			<HStack className="items-center gap-3 p-2">
				{/* A row beside the close: hug, or Yoga hands the control the whole row and the close,
				    the cashier's way out of a checkout, falls off screen. */}
				<TenderTabs flow={flow} hug />
				{flow.saveState?.kind === 'saving' && !payload.number ? (
					<Skeleton shape="line" className="w-40" testID="checkout-title-skeleton" />
				) : null}
				<View className="flex-1" />
				<CancelPaymentButton flow={flow} size="sm" />
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
			<View className="flex-1 p-4">
				<CheckoutBodyView
					flow={flow}
					order={order}
					format={format}
					receiptHost="stage"
					pane={<TenderPane flow={flow} format={format} onLeave={leave} />}
				/>
			</View>
			{flow.confirmDialog}
		</View>
	);
}
