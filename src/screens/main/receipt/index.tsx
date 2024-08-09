import * as React from 'react';

import { useNavigation, StackActions } from '@react-navigation/native';
import {
	useObservableSuspense,
	ObservableResource,
	useObservableEagerState,
} from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/tailwind/src/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@wcpos/tailwind/src/dialog';
import { ModalContainer, ModalContent, ModalFooter, ModalTitle } from '@wcpos/tailwind/src/modal';

import { EmailForm } from './components/email';
import { ReceiptTemplate } from './components/template-webview';
import { useT } from '../../../contexts/translations';
import useModalRefreshFix from '../../../hooks/use-modal-refresh-fix';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

/**
 *
 */
export const ReceiptModal = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const t = useT();
	useModalRefreshFix();
	const navigation = useNavigation();

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const orderID = useObservableEagerState(order.id$);
	const billingEmail = useObservableEagerState(order.billing.email$);

	/**
	 *
	 */
	return (
		<ModalContainer>
			<ModalTitle>{t('Receipt', { _tags: 'core' })}</ModalTitle>
			<ModalContent>
				<ReceiptTemplate order={order} />
			</ModalContent>
			<ModalFooter>
				<Button variant="secondary" onPress={() => navigation.dispatch(StackActions.pop(1))}>
					<ButtonText>{t('Close', { _tags: 'core' })}</ButtonText>
				</Button>
				<Dialog>
					<DialogTrigger asChild>
						<Button>
							<ButtonText>{t('Email Receipt', { _tags: 'core' })}</ButtonText>
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogTitle>{t('Email Receipt', { _tags: 'core' })}</DialogTitle>
						<EmailForm defaultEmail={billingEmail} orderID={orderID} />
					</DialogContent>
				</Dialog>
				<Button>
					<ButtonText>{t('Print Receipt', { _tags: 'core' })}</ButtonText>
				</Button>
			</ModalFooter>
		</ModalContainer>
	);
};

export default ReceiptModal;
