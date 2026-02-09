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
import type { WebViewProps } from '@wcpos/components/webview';

import { PaymentWebview } from './components/payment-webview';
import CheckoutTitle from './components/title';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
export const Checkout = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const orderNumber = useObservableEagerState(order.number$!);
	const t = useT();
	const webViewRef = React.useRef<{ postMessage?: (msg: unknown) => void }>(null);
	const [loading, setLoading] = React.useState(false);

	/**
	 *
	 */
	const handleProcessPayment = React.useCallback(() => {
		setLoading(true);
		if (webViewRef.current && webViewRef.current.postMessage) {
			webViewRef.current.postMessage({ action: 'wcpos-process-payment' });
		}
	}, []);

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
						<PaymentWebview order={order} ref={webViewRef as never} setLoading={setLoading} />
					</VStack>
				</ModalBody>
				<ModalFooter>
					<ModalClose testID="cancel-checkout-button">{t('common.cancel')}</ModalClose>
					<ModalAction
						testID="process-payment-button"
						onPress={handleProcessPayment}
						loading={loading}
					>
						{t('pos_checkout.process_payment')}
					</ModalAction>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
};
