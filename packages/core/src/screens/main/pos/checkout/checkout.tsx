import * as React from 'react';

import { useRouter } from 'expo-router';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';

import {
	Modal,
	ModalAction,
	ModalBody,
	ModalClose,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import type { WebViewHandle } from '@wcpos/components/webview';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { type PaymentFrameStatus, PaymentWebview } from './components/payment-webview';
import { CheckoutTitle } from './components/title';
import { useCheckoutSession } from './hooks/use-checkout-session';
import { TenderCheckout } from './tender/tender-checkout';
import { useT } from '../../../../contexts/translations';
import { usePaymentMethods } from '../../hooks/use-payment-methods';
import { useStorageMoneyPathGuard } from '../../hooks/use-storage-health';
import { TotalsChangedBanner } from '../cart/totals-changed-banner';
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
			<Modal>
				<ModalContent testID="checkout-dialog" size="lg">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('common.no_order_found')}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
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
		return <TenderCheckout order={order} />;
	}

	return <LegacyCheckoutDocument order={order} />;
}

function LegacyCheckoutDocument({ order }: { order: EngineRecord<'orders'> }) {
	const orderData = useRecordField(order, (record) => record.payload);
	const orderNumber = orderData.number;
	const stockRejection = useObservableEagerState(stockRejection$);
	const router = useRouter();
	const t = useT();
	const webViewRef = React.useRef<WebViewHandle>(null);
	const [legacyLoading, setLegacyLoading] = React.useState(false);
	// `wcpos-process-payment` is fire-and-forget: no ack, no retry. Posted before
	// the store's order-pay document has loaded, it is dropped silently and the
	// cashier is left with a button that spins forever (#1024). The payment frame
	// reports its load event; until then the footer stays gated.
	//
	// The status is mirrored into a ref because the render state alone cannot be
	// trusted by the handler: when the frame's src is swapped (JWT refresh, a new
	// payment link) the press already in flight still carries the closure from the
	// render that said `ready`. The ref is written the moment the frame re-gates,
	// so the guard reads live state rather than a snapshot.
	const [frameStatus, setFrameStatus] = React.useState<PaymentFrameStatus>('loading');
	const frameStatusRef = React.useRef<PaymentFrameStatus>('loading');
	const reportFrameStatus = React.useCallback((next: PaymentFrameStatus) => {
		frameStatusRef.current = next;
		setFrameStatus(next);
	}, []);
	const { loading, mode, error, startCheckout, handleStockRejection } = useCheckoutSession(order);
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
	const frameGateApplies = mode === 'webview' && !paymentLinkMissing;
	const paymentFrameLoading = frameGateApplies && frameStatus === 'loading';
	const paymentFrameFailed = frameGateApplies && frameStatus === 'failed';
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

		// Refuse rather than post into a document that cannot be listening yet: the
		// message would vanish with no ack and no retry. `disabled` covers the
		// render; the ref covers a press that beats the re-render, including one
		// held over from before the frame's src was swapped.
		if (frameStatusRef.current !== 'ready') {
			return;
		}

		setLegacyLoading(true);
		if (webViewRef.current && webViewRef.current.postMessage) {
			webViewRef.current.postMessage({ action: 'wcpos-process-payment' });
		}
	}, [blockIfDegraded, mode, order.uuid, startCheckout]);

	/**
	 *
	 */
	return (
		<Modal>
			<ModalContent testID="checkout-dialog" size="xl" className="h-full">
				<ModalHeader>
					<ModalTitle>
						<Text>
							{orderNumber
								? t('pos_checkout.checkout_order', { orderNumber })
								: t('pos_checkout.checkout')}
						</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody contentContainerStyle={{ height: '100%' }}>
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
							<VStack
								space="xs"
								className="border-destructive bg-destructive/10 rounded-md border p-3"
							>
								<Text testID="checkout-storage-unavailable" className="text-destructive">
									{t('pos_checkout.storage_unavailable')}
								</Text>
							</VStack>
						) : null}
						{(paymentLinkMissing || paymentFrameFailed) && !showStockRejection ? (
							<VStack
								space="xs"
								className="border-destructive bg-destructive/10 rounded-md border p-3"
							>
								<Text testID="checkout-payment-form-unavailable" className="text-destructive">
									{paymentLinkMissing
										? t('pos_checkout.payment_form_unavailable')
										: t('pos_checkout.payment_form_load_failed')}
								</Text>
							</VStack>
						) : null}
						{mode === 'webview' && !showStockRejection ? (
							<PaymentWebview
								order={order}
								ref={webViewRef}
								setLoading={setLegacyLoading}
								setFrameStatus={reportFrameStatus}
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
									<VStack
										space="xs"
										className="border-destructive bg-destructive/10 rounded-md border p-3"
									>
										<Text className="text-destructive font-semibold">
											{t('pos_checkout.insufficient_stock_message')}
										</Text>
										{stockRejection!.items.map((item) => (
											<Text
												key={`${item.product_id}-${item.variation_id}`}
												className="text-destructive text-sm"
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
									</VStack>
								) : (
									error && <Text className="text-destructive">{error}</Text>
								)}
							</VStack>
						)}
					</VStack>
				</ModalBody>
				<ModalFooter>
					{!showStockRejection && (
						<ModalClose testID="cancel-checkout-button">{t('common.cancel')}</ModalClose>
					)}
					{showStockRejection ? (
						<ModalAction
							testID="return-to-cart-button"
							onPress={() => router.replace({ pathname: '/cart' })}
						>
							{t('pos_checkout.return_to_cart')}
						</ModalAction>
					) : (
						<ModalAction
							testID="process-payment-button"
							onPress={handleProcessPayment}
							loading={mode === 'contract' ? loading : legacyLoading || paymentFrameLoading}
							disabled={
								mode === 'pending' ||
								storageDegraded ||
								error === 'payment_gateways_fetch_failed' ||
								paymentLinkMissing ||
								(mode === 'contract' && loading) ||
								paymentFrameLoading ||
								paymentFrameFailed
							}
						>
							{t('pos_checkout.process_payment')}
						</ModalAction>
					)}
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
