import * as React from 'react';

import {
	useObservableSuspense,
	ObservableResource,
	useObservableEagerState,
} from 'observable-hooks';

import { Button, ButtonText } from '@wcpos/components/src/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/src/dialog';
import {
	Modal,
	ModalContent,
	ModalFooter,
	ModalTitle,
	ModalBody,
	ModalClose,
	ModalHeader,
} from '@wcpos/components/src/modal';
import { Text } from '@wcpos/components/src/text';

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

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const orderID = useObservableEagerState(order.id$);
	const billingEmail = useObservableEagerState(order.billing.email$);

	/**
	 *
	 */
	return (
		<Modal>
			<ModalContent size="xl" className="h-5/6">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('Receipt', { _tags: 'core' })}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<ReceiptTemplate order={order} />
				</ModalBody>
				<ModalFooter>
					<ModalClose asChild>
						<Button variant="muted">
							<ButtonText>{t('Close', { _tags: 'core' })}</ButtonText>
						</Button>
					</ModalClose>
					<Dialog>
						<DialogTrigger asChild>
							<Button>
								<ButtonText>{t('Email Receipt', { _tags: 'core' })}</ButtonText>
							</Button>
						</DialogTrigger>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>
									<Text>{t('Email Receipt', { _tags: 'core' })}</Text>
								</DialogTitle>
							</DialogHeader>
							<DialogBody>
								<EmailForm defaultEmail={billingEmail} orderID={orderID} />
							</DialogBody>
						</DialogContent>
					</Dialog>
					<Button>
						<ButtonText>{t('Print Receipt', { _tags: 'core' })}</ButtonText>
					</Button>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
};

export default ReceiptModal;
