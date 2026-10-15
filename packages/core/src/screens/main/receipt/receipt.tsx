import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import {
	Dialog,
	DialogAction,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@wcpos/components/v2/dialog';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { ReceiptBody } from './receipt-body';
import { ReceiptActions } from './receipt-actions';
import { useReceiptDocument } from './use-receipt-document';
import { useT } from '../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
	document?: string;
	side?: 'left' | 'right';
}

/**
 *
 */
export function Receipt({ resource, document, side = 'right' }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();

	if (!order) {
		return (
			<Dialog route>
				<DialogContent side={side} size="xl">
					<DialogHeader>
						<DialogTitle>
							<Text>{t('common.no_order_found')}</Text>
						</DialogTitle>
					</DialogHeader>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<ReceiptDocument
			key={`${order.uuid}:${document ?? ''}`}
			order={order}
			document={document}
			side={side}
		/>
	);
}

function ReceiptDocument({
	order,
	document,
	side = 'right',
}: {
	order: EngineRecord<'orders'>;
	document?: string;
	side?: 'left' | 'right';
}) {
	const t = useT();
	const doc = useReceiptDocument({ order, autoPrintAllowed: false, document });
	return (
		<Dialog route>
			<DialogContent side={side} size="xl">
				<DialogHeader>
					<DialogTitle>
						<Text>{t(document ? 'receipt.refund_receipt' : 'common.receipt')}</Text>
					</DialogTitle>
				</DialogHeader>
				<DialogBody contentContainerStyle={{ height: '100%' }}>
					<ReceiptBody doc={doc} />
				</DialogBody>
				<DialogFooter>
					<DialogClose testID="receipt-close-button">{t('common.close')}</DialogClose>
					<ReceiptActions doc={doc} order={order} buttonComponent={DialogAction} />
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
