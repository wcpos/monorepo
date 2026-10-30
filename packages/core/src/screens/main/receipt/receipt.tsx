import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { EmptyState } from '@wcpos/components/empty-state';
import { Text } from '@wcpos/components/text';
import type { EngineRecord } from '@wcpos/query';

import { PrintSheetContent } from './print-sheet';
import { useReceiptActions } from './receipt-actions';
import { useReceiptDocument } from './use-receipt-document';
import { useT } from '../../../contexts/translations';

interface Props {
	resource: ObservableResource<EngineRecord<'orders'> | null>;
	document?: string;
}

/**
 *
 */
export function Receipt({ resource, document }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();

	if (!order) {
		return (
			<Dialog route>
				<DialogContent side="right" size="xl">
					<DialogHeader>
						<DialogTitle>
							<Text>{t('common.receipt')}</Text>
						</DialogTitle>
					</DialogHeader>
					<EmptyState kind="empty" title={t('common.no_order_found')} />
				</DialogContent>
			</Dialog>
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
	const doc = useReceiptDocument({ order, autoPrintAllowed: false, document });
	const { sync, choices, print, dialog } = useReceiptActions(doc, order);
	return (
		<Dialog route>
			<PrintSheetContent
				doc={doc}
				title={document ? t('receipt.refund_receipt') : t('common.receipt')}
				printLabel={t('receipt.print_receipt')}
				record={sync}
				secondary={choices}
				onPrint={print.onPress}
				testID="receipt-dialog"
				close={{ testID: 'receipt-close-button' }}
				printTestID="receipt-print-button"
			>
				{dialog}
			</PrintSheetContent>
		</Dialog>
	);
}
