import * as React from 'react';

import { useRouter } from 'expo-router';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableSuspense,
} from 'observable-hooks';
import { isRxDocument } from 'rxdb';

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

import { PaymentWebview } from './components/payment-webview';
import { CheckoutTitle } from './components/title';
import { useCheckoutSession } from './hooks/use-checkout-session';
import { useT } from '../../../../contexts/translations';
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
				<ModalContent size="lg">
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
	const { loading, mode, error, startCheckout, handleCheckoutError } = useCheckoutSession(
		order as import('@wcpos/database').OrderDocument
	);
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

		if (mode === 'contract') {
			await startCheckout();
			return;
		}

		setLegacyLoading(true);
		if (webViewRef.current && webViewRef.current.postMessage) {
			webViewRef.current.postMessage({ action: 'wcpos-process-payment' });
		}
	}, [mode, startCheckout]);

	/**
	 *
	 */
	return (
		<Modal>
			<ModalContent size="xl" className="h-full">
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
						{showStockRejection ? (
							<VStack
								space="xs"
								className="border-destructive bg-destructive/10 rounded-md border p-3"
							>
								<Text className="text-destructive font-semibold">
									{t('pos_checkout.insufficient_stock_message')}
								</Text>
								{stockRejection.items.map((item) => (
									<Text
										key={`${item.product_id}-${item.variation_id}`}
										className="text-destructive text-sm"
										decodeHtml
									>
										{item.available === null
											? t('pos_products.out_of_stock', {
													name: item.name ?? '',
												})
											: t('pos_cart.only_n_available', {
													quantity: item.available,
													name: item.name ?? '',
												})}
									</Text>
								))}
							</VStack>
						) : mode === 'webview' ? (
							<PaymentWebview
								order={order}
								ref={webViewRef}
								setLoading={setLegacyLoading}
								onCheckoutError={handleCheckoutError}
							/>
						) : (
							<VStack space="sm">
								{mode === 'pending' ? (
									<Text>{t('common.loading')}</Text>
								) : (
									<Text>{t('pos_checkout.amount_to_pay')}</Text>
								)}
								{error && <Text className="text-destructive">{error}</Text>}
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
							loading={mode === 'contract' ? loading : legacyLoading}
							disabled={
								mode === 'pending' ||
								error === 'payment_gateways_fetch_failed' ||
								(mode === 'contract' && loading)
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
