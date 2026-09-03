import * as React from 'react';
import { View } from 'react-native';

import { Button, ButtonText } from '@wcpos/components/button';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';
import type { WebViewHandle } from '@wcpos/components/webview';

import { useT } from '../../../../../contexts/translations';
import { type PaymentFrameStatus, PaymentWebview } from '../components/payment-webview';
import { useCheckoutSession } from '../hooks/use-checkout-session';

import type { TenderFlow } from './use-tender-flow';

interface Props {
	flow: TenderFlow;
	order: EngineRecord<'orders'>;
}

/**
 * The compatibility surface. Gateways declared `capture.mode: 'webview'` are
 * driven by the store's own payment page, which charges the whole order in one
 * go — so they can never be one leg of a split, and the tab greys out the moment
 * the ledger holds live money rather than letting a cashier double-charge.
 */
export function LegacyTab({ flow, order }: Props) {
	const t = useT();
	const paymentURL = useRecordField(order, (record) => record.payload.links?.payment?.[0]?.href);
	const { handleStockRejection } = useCheckoutSession(order);
	const webViewRef = React.useRef<WebViewHandle>(null);
	const [loading, setLoading] = React.useState(false);
	const [frameStatus, setFrameStatus] = React.useState<PaymentFrameStatus>('loading');
	// See checkout.tsx (#1024): `wcpos-process-payment` is fire-and-forget, so a
	// press that beats the re-render must read live state, not a render snapshot.
	const frameStatusRef = React.useRef<PaymentFrameStatus>('loading');
	const reportFrameStatus = React.useCallback((next: PaymentFrameStatus) => {
		frameStatusRef.current = next;
		setFrameStatus(next);
	}, []);

	const handleProcess = React.useCallback(() => {
		if (frameStatusRef.current !== 'ready') return;
		setLoading(true);
		webViewRef.current?.postMessage?.({ action: 'wcpos-process-payment' });
	}, []);

	if (flow.hasLiveLeg) {
		return (
			<VStack space="sm" className="p-4">
				<View className="border-warning bg-warning/10 rounded-md border p-3">
					<Text className="text-warning text-sm">{t('pos_checkout.legacy_not_with_split')}</Text>
				</View>
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

	if (!paymentURL) {
		return (
			<View className="border-destructive bg-destructive/10 m-4 rounded-md border p-3">
				<Text testID="checkout-payment-form-unavailable" className="text-destructive">
					{t('pos_checkout.payment_form_unavailable')}
				</Text>
			</View>
		);
	}

	return (
		<VStack space="sm" className="flex-1 p-4">
			{frameStatus === 'failed' ? (
				<View className="border-destructive bg-destructive/10 rounded-md border p-3">
					<Text testID="checkout-payment-form-load-failed" className="text-destructive">
						{t('pos_checkout.payment_form_load_failed')}
					</Text>
				</View>
			) : null}
			<PaymentWebview
				order={order}
				ref={webViewRef}
				setLoading={setLoading}
				setFrameStatus={reportFrameStatus}
				onStockRejection={handleStockRejection}
			/>
			<HStack className="justify-end">
				<Button
					testID="checkout-legacy-process-payment"
					size="lg"
					loading={loading || frameStatus === 'loading'}
					disabled={frameStatus !== 'ready' || loading}
					onPress={handleProcess}
				>
					<ButtonText>{t('pos_checkout.process_payment')}</ButtonText>
				</Button>
			</HStack>
		</VStack>
	);
}
