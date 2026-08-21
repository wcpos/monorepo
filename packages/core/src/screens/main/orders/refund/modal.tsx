import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { type EngineRecord, useRecordField } from '@wcpos/query';

import { RefundOrderForm } from './form';
import { useT } from '../../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
}

export function RefundOrderModal({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	const orderId = useRecordField(order, (record) => record.payload.id);

	if (!order) {
		return (
			<Modal>
				<ModalContent size="xl">
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
			<ModalContent size="xl">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('orders.refund_order', { number: orderId || '' })}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody>
					<RefundOrderForm order={order} />
				</ModalBody>
			</ModalContent>
		</Modal>
	);
}
