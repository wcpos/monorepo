import * as React from 'react';

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

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
export function Checkout({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const orderNumber = useObservableEagerState(order.number$!);
	const t = useT();
	const webViewRef = React.useRef<WebViewHandle>(null);
	const [legacyLoading, setLegacyLoading] = React.useState(false);
	const { loading, mode, startCheckout } = useCheckoutSession(
		order as import('@wcpos/database').OrderDocument
	);

	/**
	 *
	 */
	const handleProcessPayment = React.useCallback(async () => {
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
						{mode === 'webview' ? (
							<PaymentWebview order={order} ref={webViewRef} setLoading={setLegacyLoading} />
						) : (
							<Text>{t('pos_checkout.amount_to_pay')}</Text>
						)}
					</VStack>
				</ModalBody>
				<ModalFooter>
					<ModalClose testID="cancel-checkout-button">{t('common.cancel')}</ModalClose>
					<ModalAction
						testID="process-payment-button"
						onPress={handleProcessPayment}
						loading={mode === 'contract' ? loading : legacyLoading}
					>
						{t('pos_checkout.process_payment')}
					</ModalAction>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
