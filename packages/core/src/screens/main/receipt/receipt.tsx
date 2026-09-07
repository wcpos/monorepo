import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

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
import type { EngineRecord } from '@wcpos/query';

import { ReceiptBody } from './receipt-body';
import { ReceiptActions } from './receipt-actions';
import { useReceiptDocument } from './use-receipt-document';
import { useT } from '../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
}

/**
 *
 */
export function Receipt({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();

	if (!order) {
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

	return <ReceiptDocument key={order.uuid} order={order} />;
}

function ReceiptDocument({ order }: { order: EngineRecord<'orders'> }) {
	const t = useT();
	const doc = useReceiptDocument({ order, autoPrintAllowed: false });
	return (
		<Modal>
			<ModalContent size="xl" className="h-full">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('common.receipt')}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody contentContainerStyle={{ height: '100%' }}>
					<ReceiptBody doc={doc} />
				</ModalBody>
				<ModalFooter>
					<ModalClose testID="receipt-close-button">{t('common.close')}</ModalClose>
					<ReceiptActions doc={doc} order={order} buttonComponent={ModalAction} />
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
