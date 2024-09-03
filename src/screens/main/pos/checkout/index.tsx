import * as React from 'react';
import { ScrollView } from 'react-native';

import { useNavigation, StackActions } from '@react-navigation/native';
import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	ModalOverlay,
	ModalContainer,
	ModalContent,
	ModalHeader,
	ModalTitle,
	ModalFooter,
} from '@wcpos/components/src/modal';
import { VStack } from '@wcpos/components/src/vstack';

import { PaymentWebview } from './components/payment-webview';
import CheckoutTitle from './components/title';
import { useT } from '../../../../contexts/translations';
import useModalRefreshFix from '../../../../hooks/use-modal-refresh-fix';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
const Checkout = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const t = useT();
	const iframeRef = React.useRef<HTMLIFrameElement>();
	const navigation = useNavigation();
	useModalRefreshFix();

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const number = useObservableState(order.number$, order.number);
	// const { setTitle } = useModal();

	/**
	 * Update title with order number
	 */
	// React.useEffect(() => {
	// 	let title = t('Checkout', { _tags: 'core' });
	// 	if (number) {
	// 		title = t('Checkout Order #{number}', {
	// 			_tags: 'core',
	// 			number,
	// 			_context: 'Checkout Order title',
	// 		});
	// 	}
	// 	// setTitle(() => title);
	// }, [number, setTitle, t]);

	/**
	 *
	 */
	const handleProcessPayment = React.useCallback(() => {
		if (iframeRef.current && iframeRef.current.contentWindow) {
			iframeRef.current.contentWindow.postMessage({ action: 'wcpos-process-payment' }, '*');
		}
	}, []);

	/**
	 *
	 */
	return (
		<ModalContainer className="w-full h-5/6 max-w-screen-md">
			<ModalHeader>
				<ModalTitle>{t('Checkout', { _tags: 'core' })}</ModalTitle>
			</ModalHeader>
			<ModalContent contentContainerStyle={{ height: '100%' }}>
				<VStack className="h-full">
					<CheckoutTitle order={order} />
					<PaymentWebview order={order} ref={iframeRef} />
				</VStack>
			</ModalContent>
			<ModalFooter>
				<Button variant="muted" onPress={() => navigation.dispatch(StackActions.pop(1))}>
					<ButtonText>{t('Cancel', { _tags: 'core' })}</ButtonText>
				</Button>
				<Button onPress={handleProcessPayment}>
					<ButtonText>{t('Process Payment', { _tags: 'core' })}</ButtonText>
				</Button>
			</ModalFooter>
		</ModalContainer>
	);
};

export default Checkout;
