import * as React from 'react';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Notice } from '@wcpos/components/notice';
import { Skeleton } from '@wcpos/components/skeleton';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { PaymentWebview } from '../components/payment-webview';
import { useCheckoutSession } from '../hooks/use-checkout-session';
import { PayFrameNotice } from '../pay-page/pay-frame-notice';
import { usePayFrameGate } from '../pay-page/use-pay-frame-gate';

import type { TenderFlow } from './use-tender-flow';

interface Props {
	flow: TenderFlow;
	order: EngineRecord<'orders'>;
	receiptHost?: 'modal' | 'stage';
}

/**
 * The compatibility surface. Gateways declared `capture.mode: 'webview'` are
 * driven by the store's own payment page, which charges the whole order in one
 * go — so they can never be one leg of a split, and the tab greys out the moment
 * the ledger holds live money rather than letting a cashier double-charge.
 */
export function LegacyTab({ flow, order, receiptHost }: Props) {
	const t = useT();
	const paymentURL = useRecordField(order, (record) => record.payload.links?.payment?.[0]?.href);
	const { handleStockRejection, settledOrderStatuses, gatewayResolved, gatewayError, refetch } =
		useCheckoutSession(order);
	const frameGate = usePayFrameGate();

	if (flow.hasLiveLeg) {
		return (
			<VStack space="sm" className="p-4">
				<Notice
					tone="warning"
					title={t('pos_checkout.legacy_not_with_split_title')}
					description={t('pos_checkout.legacy_not_with_split_description')}
				/>
				{flow.legacyMethods.map((method) => (
					<Text
						key={method.id}
						testID={`checkout-legacy-${method.id}`}
						className="text-muted-foreground border-border rounded-md border p-3 text-sm"
						decodeHtml
					>
						{method.title}
					</Text>
				))}
			</VStack>
		);
	}

	if (flow.legacyMethods.length === 0) {
		return (
			<Text className="text-muted-foreground p-4 text-sm">
				{t('pos_checkout.no_legacy_methods')}
			</Text>
		);
	}

	// Link or no link: a frame for the previous server copy could take payment
	// against stale totals while the edited order is still saving — and a save
	// queued offline is the same stale copy waiting on reconnect, so the webview
	// stays blocked until the write actually lands (it needs the server anyway).
	//
	// The frame also waits for the gateway catalog, as the modal checkout does: mounting it
	// commits the sale and journals every gateway's stored status for replay, once. A frame
	// mounted before the catalog loads journals none, and a sale settled at a stored unpaid
	// status (BACS at pending) would never replay to completion.
	if (flow.saveState || !gatewayResolved) {
		return <Skeleton className="m-4" testID="checkout-legacy-skeleton" />;
	}
	if (gatewayError) {
		return (
			<Notice
				tone="bad"
				className="m-4"
				title={t('pos_checkout.gateway_catalog_unavailable')}
				actions={[
					{
						label: t('pos_checkout.try_again'),
						onPress: () => void refetch(),
						testID: 'checkout-gateway-catalog-retry',
					},
				]}
			/>
		);
	}
	if (!paymentURL) {
		return (
			<PayFrameNotice
				status="link-missing"
				className="m-4"
				testID="checkout-payment-form-unavailable"
			/>
		);
	}

	return (
		<VStack space="sm" className="flex-1 p-4">
			<PayFrameNotice
				status={frameGate.status}
				onRetry={frameGate.retry}
				testID="checkout-payment-form-load-failed"
			/>
			<PaymentWebview
				order={order}
				receiptHost={receiptHost}
				{...frameGate.frameProps}
				settledOrderStatuses={settledOrderStatuses}
				onStockRejection={handleStockRejection}
			/>
			<HStack className="justify-end">
				<Button
					testID="checkout-legacy-process-payment"
					size="lg"
					loading={frameGate.busy || frameGate.status === 'loading'}
					disabled={frameGate.status !== 'ready' || frameGate.busy}
					onPress={frameGate.press}
				>
					<ButtonText>{t('pos_checkout.process_payment')}</ButtonText>
				</Button>
			</HStack>
		</VStack>
	);
}
