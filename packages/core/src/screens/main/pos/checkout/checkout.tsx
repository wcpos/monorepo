import * as React from 'react';

import { useRouter } from 'expo-router';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/dialog';
import { useIsPhone } from '@wcpos/components/lib/device';
import { EmptyState } from '@wcpos/components/empty-state';
import { Notice } from '@wcpos/components/notice';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { PaymentWebview } from './components/payment-webview';
import { CheckoutTitle } from './components/title';
import { useCheckoutSession } from './hooks/use-checkout-session';
import { PayFrameNotice } from './pay-page/pay-frame-notice';
import { usePayFrameGate } from './pay-page/use-pay-frame-gate';
import { TenderCheckout } from './tender/tender-checkout';
import { returnToTill } from './till-route';
import { useT } from '../../../../contexts/translations';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { useStorageMoneyPathGuard } from '../../hooks/use-storage-health';
import { TotalsChangedBanner } from '../cart/totals-changed-banner';
import { StorageOutageBanner } from '../components/storage-outage-banner';
import { stockRejection$ } from '../hooks/stock-rejection';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
}

/**
 *
 */
export function Checkout({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();

	if (!order) {
		return (
			<Dialog route>
				<DialogContent testID="checkout-dialog" size="lg">
					<DialogHeader>
						<DialogTitle>
							<Text>{t('pos_checkout.checkout')}</Text>
						</DialogTitle>
					</DialogHeader>
					<EmptyState kind="empty" title={t('common.no_order_found')} />
				</DialogContent>
			</Dialog>
		);
	}

	return <CheckoutDocument order={order} />;
}

/**
 * Which checkout the till gets is decided by the store, not by a setting: a store
 * serving `GET wcpos/v2/payment-methods` has the payments contract and gets the
 * two-pane tender flow (wcpos/roadmap#143). A store that does not — an older
 * plugin, or one whose descriptor is a schema this build cannot read — keeps the
 * gateway checkout it has always had. There is no half-way state where a cashier
 * meets a tile grid the server cannot record against.
 */
function CheckoutDocument({ order }: { order: EngineRecord<'orders'> }) {
	const { loaded, unsupportedSchema } = usePaymentMethods();
	// Latched once, when the modal opens. The descriptor can change underneath an open
	// checkout (a config refresh, a 404 invalidating the cache); swapping the component then
	// would unmount a tender flow holding live legs without running its cancel guard. The
	// next time checkout opens, the current answer is read again.
	const [useTenderFlow] = React.useState(() => loaded && !unsupportedSchema);

	if (useTenderFlow) {
		return <TenderCheckout key={order.uuid} order={order} />;
	}

	return <LegacyCheckoutDocument order={order} />;
}

function LegacyCheckoutDocument({ order }: { order: EngineRecord<'orders'> }) {
	const orderData = useRecordField(order, (record) => record.payload);
	const orderNumber = orderData.number;
	const stockRejection = useObservableEagerState(stockRejection$);
	const router = useRouter();
	const phone = useIsPhone();
	const t = useT();
	// The legacy frame's footer gate (#1024): see usePayFrameGate.
	const frameGate = usePayFrameGate();
	const { status: frameStatus, press: pressPaymentFrame } = frameGate;
	const {
		loading,
		mode,
		error,
		startCheckout,
		handleStockRejection,
		settledOrderStatuses,
		gatewayError,
		refetch,
	} = useCheckoutSession(order);
	// #163 ruling R5. This modal is where a checkout already in progress is caught:
	// it was opened while storage was healthy, and the worker can die at any point
	// before the cashier presses Process Payment.
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();
	// The legacy webview can only process a payment when the server has supplied a
	// payment link; without it the modal body shows an error and processing must stay
	// disabled (a click would otherwise post into a null webview ref and spin forever).
	const paymentURL = orderData.links?.payment?.[0]?.href;
	const paymentLinkMissing = mode === 'webview' && !paymentURL;
	// Scoped to the legacy webview path — contract checkout posts nothing into a
	// frame, so it has nothing to wait for. When the link is missing no frame is
	// rendered at all, and `paymentLinkMissing` is already the reason shown.
	const frameGateApplies = mode === 'webview' && !paymentLinkMissing && !gatewayError;
	// Anything but `ready` blocks the press, so a new status blocks by default;
	// `loading` alone also spins.
	const paymentFrameBlocked = frameGateApplies && frameStatus !== 'ready';
	const paymentFrameLoading = frameGateApplies && frameStatus === 'loading';
	const showStockRejection =
		error === 'insufficient_stock' &&
		stockRejection !== null &&
		stockRejection.orderUuid === order.uuid &&
		stockRejection.items.length > 0;

	/**
	 *
	 */
	const handleProcessPayment = React.useCallback(async () => {
		if (mode === 'pending') {
			return;
		}

		if (blockIfDegraded('process-payment', { orderId: order.uuid })) {
			return;
		}

		if (mode === 'contract') {
			await startCheckout();
			return;
		}

		// The frame gate last: it refuses silently, so every guard that explains
		// itself (the storage toast above all) has to have had its turn first.
		pressPaymentFrame();
	}, [blockIfDegraded, mode, order.uuid, pressPaymentFrame, startCheckout]);

	/**
	 *
	 */
	return (
		<Dialog route>
			<DialogContent testID="checkout-dialog" size="xl" className="h-full">
				<DialogHeader>
					<DialogTitle>
						<Text>
							{orderNumber
								? t('pos_checkout.checkout_order', { orderNumber })
								: t('pos_checkout.checkout')}
						</Text>
					</DialogTitle>
				</DialogHeader>
				<DialogBody contentContainerStyle={{ height: '100%' }}>
					<VStack className="flex-1">
						<CheckoutTitle order={order} />
						{/* R1. The cart's copy of this banner is behind this full-height
						    modal, and the write that produces a divergence is usually the
						    Pay button's own save — so without a mount HERE the cashier can
						    take payment having never seen that the store changed the money.
						    This is the exact moment the ruling names: before goods change
						    hands. It does not gate Process Payment; the server's totals
						    stand, and the cashier decides. */}
						<TotalsChangedBanner orderId={order.uuid} testID="checkout-totals-changed-banner" />
						{storageDegraded && !showStockRejection ? (
							<StorageOutageBanner testID="checkout-storage-unavailable" />
						) : null}
						{mode === 'webview' && !gatewayError && !showStockRejection ? (
							<PayFrameNotice
								status={paymentLinkMissing ? 'link-missing' : frameStatus}
								onRetry={frameGate.retry}
								testID="checkout-payment-form-unavailable"
							/>
						) : null}
						{gatewayError ? (
							<Notice
								tone="bad"
								title={t('pos_checkout.gateway_catalog_unavailable')}
								actions={[
									{
										label: t('pos_checkout.try_again'),
										onPress: () => void refetch(),
										testID: 'checkout-gateway-catalog-retry',
									},
								]}
								testID="checkout-gateway-catalog-unavailable"
							/>
						) : mode === 'webview' && !showStockRejection ? (
							<PaymentWebview
								order={order}
								{...frameGate.frameProps}
								settledOrderStatuses={settledOrderStatuses}
								onStockRejection={handleStockRejection}
							/>
						) : (
							<VStack space="sm">
								{mode === 'pending' ? (
									<Text>{t('common.loading')}</Text>
								) : (
									<Text>{t('pos_checkout.amount_to_pay')}</Text>
								)}
								{showStockRejection ? (
									<Notice
										tone="bad"
										title={t('pos_checkout.insufficient_stock_message')}
										testID="checkout-stock-rejection"
									>
										{stockRejection!.items.map((item) => (
											<Text
												key={`${item.product_id}-${item.variation_id}`}
												className="text-muted-foreground text-sm"
												decodeHtml
											>
												{item.available === null
													? t('pos_products.out_of_stock', { name: item.name ?? '' })
													: t('pos_cart.only_n_available', {
															quantity: item.available,
															name: item.name ?? '',
														})}
											</Text>
										))}
									</Notice>
								) : (
									error && <Text className="text-destructive">{error}</Text>
								)}
							</VStack>
						)}
					</VStack>
				</DialogBody>
				<DialogFooter
					close={!showStockRejection && { testID: 'cancel-checkout-button' }}
					intent={
						showStockRejection
							? {
									label: t('pos_checkout.return_to_cart'),
									testID: 'return-to-cart-button',
									onPress: () => returnToTill(router, phone, 'cart'),
								}
							: {
									label: t('pos_checkout.process_payment'),
									testID: 'process-payment-button',
									onPress: () => void handleProcessPayment(),
									disabled:
										mode === 'pending' ||
										storageDegraded ||
										error === 'payment_gateways_fetch_failed' ||
										paymentLinkMissing ||
										(mode === 'contract' && loading) ||
										paymentFrameBlocked,
									loading: mode === 'contract' ? loading : frameGate.busy || paymentFrameLoading,
								}
					}
				/>
			</DialogContent>
		</Dialog>
	);
}
