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
import { usePOSOverlaySide } from '../pos/contexts/overlay-side';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
	document?: string;
}

/**
 *
 */
export function Receipt({ resource, document }: Props) {
	const side = usePOSOverlaySide();
	const order = useObservableSuspense(resource);
	const t = useT();

	if (!order) {
		return (
			<Modal>
				<ModalContent side={side} size="xl">
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
		<ReceiptDocument key={`${order.uuid}:${document ?? ''}`} order={order} document={document} />
	);
}

function ReceiptDocument({
	order,
	document,
}: {
	order: EngineRecord<'orders'>;
	document?: string;
}) {
	const t = useT();
	const side = usePOSOverlaySide();
	const doc = useReceiptDocument({ order, autoPrintAllowed: false, document });
	return (
		<Modal>
			<ModalContent side={side} size="xl">
				<ModalHeader>
					<ModalTitle>
						<Text>{t(document ? 'receipt.refund_receipt' : 'common.receipt')}</Text>
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
