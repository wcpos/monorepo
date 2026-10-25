import * as React from 'react';

import type { ButtonProps } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/dialog';
import type { EngineRecord } from '@wcpos/query';

import { EmailForm } from './email';
import { useT } from '../../../contexts/translations';
import { useSyncOrder } from '../hooks/use-sync-order';

import type { useReceiptDocument } from './use-receipt-document';

export function ReceiptActions({
	doc,
	order,
	buttonComponent: Action,
}: {
	doc: ReturnType<typeof useReceiptDocument>;
	order: EngineRecord<'orders'>;
	buttonComponent: React.ComponentType<
		Pick<ButtonProps, 'onPress' | 'disabled' | 'loading' | 'testID' | 'children'>
	>;
}) {
	const t = useT();
	const { sync, loading, disabled } = useSyncOrder(order);
	return (
		<>
			{doc.unsaved && !doc.document && (
				<Action
					testID="receipt-sync-order-button"
					onPress={sync}
					loading={loading}
					disabled={disabled}
				>
					{t('pos_cart.sync_order')}
				</Action>
			)}
			{/* Reachable offline on purpose (#165). The 2026-03-06 stopgap
					    (ba8729a77) disabled this button when the store was unreachable,
					    because a send could only fail. It cannot any more: EmailForm owns
					    the offline path — it explains the situation, relabels the button,
					    and writes a durable queue row instead of a doomed round trip. A
					    cashier finishing a sale offline is the whole reason the queue
					    exists, so this is the one entry point that must NOT be gated on
					    connectivity. The PDF download above still is: that one genuinely
					    needs the server.
					    An unsaved order cannot be emailed yet: the queue is keyed by numeric order id; this is the only gate besides document. */}
			{!doc.document && (
				<Dialog>
					<DialogTrigger asChild>
						<Action testID="receipt-email-button" disabled={doc.unsaved}>
							{t('receipt.email_receipt')}
						</Action>
					</DialogTrigger>
					<DialogContent closeLabel={t('common.close')}>
						<DialogHeader>
							<DialogTitle>{t('receipt.email_receipt')}</DialogTitle>
						</DialogHeader>
						<DialogBody>
							<EmailForm order={order} localOnly={doc.isOffline} />
						</DialogBody>
					</DialogContent>
				</Dialog>
			)}
			<Action
				testID="receipt-download-pdf-button"
				onPress={doc.downloadReceiptPdf}
				disabled={!doc.canDownloadPdf}
				loading={doc.isDownloadingPdf}
			>
				{t('receipt.download_pdf')}
			</Action>
			<Action
				testID="receipt-print-button"
				// One coded row and a toast on failure (a closed print dialog is a cancel).
				onPress={() => void doc.printAndReport()}
				disabled={doc.printHeld}
				loading={doc.isPrinting || doc.isSyncing}
			>
				{t(doc.printedTo ? 'receipt.print_again' : 'receipt.print_receipt')}
			</Action>
		</>
	);
}
