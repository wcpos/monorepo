import * as React from 'react';

import { useRouter } from 'expo-router';
import get from 'lodash/get';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';

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

import { type PaymentFrameStatus, PaymentWebview } from './components/payment-webview';
import { CheckoutTitle } from './components/title';
import { useCheckoutSession } from './hooks/use-checkout-session';
import { useT } from '../../../../contexts/translations';
import { useStorageMoneyPathGuard } from '../../hooks/use-storage-health';
import { stockRejection$ } from '../hooks/stock-rejection';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
export function Checkout({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();

	if (!isRxDocument(order)) {
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

function CheckoutDocument({ order }: { order: import('@wcpos/database').OrderDocument }) {
	const orderNumber = useObservableEagerState(order.number$!);
	const stockRejection = useObservableEagerState(stockRejection$);
	const router = useRouter();
	const t = useT();
	const webViewRef = React.useRef<WebViewHandle>(null);
	const [legacyLoading, setLegacyLoading] = React.useState(false);
	// `wcpos-process-payment` is fire-and-forget: no ack, no retry. Posted before
	// the store's order-pay document has loaded, it is dropped silently and the
	// cashier is left with a button that spins forever (#1024). The payment frame
	// reports its load event; until then the footer stays gated.
	const [frameStatus, setFrameStatus] = React.useState<PaymentFrameStatus>('loading');
	const { loading, mode, error, startCheckout, handleStockRejection } = useCheckoutSession(
		order as import('@wcpos/database').OrderDocument
	);
	// #163 ruling R5. This modal is where a checkout already in progress is caught:
	// it was opened while storage was healthy, and the worker can die at any point
	// before the cashier presses Process Payment.
	const { storageDegraded, blockIfDegraded } = useStorageMoneyPathGuard();
	// The legacy webview can only process a payment when the server has supplied a
	// payment link; without it the modal body shows an error and processing must stay
	// disabled (a click would otherwise post into a null webview ref and spin forever).
	const paymentURL$ = React.useMemo(
		() =>
			order.links$
				? order.links$.pipe(map((links) => get(links, ['payment', 0, 'href'])))
				: of(get(order, ['links', 'payment', 0, 'href'])),
		[order]
	);
	const paymentURL = useObservableEagerState(paymentURL$);
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

		if (blockIfDegraded('process-payment', { orderId: order.uuid ?? order.id })) {
			return;
		}

		if (mode === 'contract') {
			await startCheckout();
			return;
		}

		// Refuse rather than post into a document that cannot be listening yet: the
		// message would vanish with no ack and no retry. `disabled` covers the
		// render; this covers a press that beats the re-render.
		if (frameStatus !== 'ready') {
			return;
		}

		setLegacyLoading(true);
		if (webViewRef.current && webViewRef.current.postMessage) {
			webViewRef.current.postMessage({ action: 'wcpos-process-payment' });
		}
	}, [blockIfDegraded, frameStatus, mode, order.id, order.uuid, startCheckout]);

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
								setFrameStatus={setFrameStatus}
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
							onPress={() => router.replace({ pathname: 'cart' })}
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
