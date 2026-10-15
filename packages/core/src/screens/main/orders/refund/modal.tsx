import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import {
	Dialog,
	DialogContent as ModalContent,
	DialogHeader as ModalHeader,
	DialogTitle as ModalTitle,
} from '@wcpos/components/v2/dialog';
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
			<Dialog route>
				<ModalContent side="right" size="xl">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('common.no_order_found')}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Dialog>
		);
	}

	return (
		<Dialog route>
			<ModalContent side="right" size="xl">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('orders.refund_order', { number: orderId || '' })}</Text>
					</ModalTitle>
				</ModalHeader>
				<RefundOrderForm order={order} />
			</ModalContent>
		</Dialog>
	);
}
