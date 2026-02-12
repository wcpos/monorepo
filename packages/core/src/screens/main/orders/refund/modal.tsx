import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';

import { RefundOrderForm } from './form';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

export function RefundOrderModal({ resource }: Props) {
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

	return (
		<Modal>
			<ModalContent size="lg">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('orders.refund_order', { number: order.id || '' })}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<RefundOrderForm order={order} />
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}
