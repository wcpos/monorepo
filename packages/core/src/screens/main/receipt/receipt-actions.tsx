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
	return (
		<>
			{/* Reachable offline on purpose (#165). The 2026-03-06 stopgap
					    (ba8729a77) disabled this button when the store was unreachable,
					    because a send could only fail. It cannot any more: EmailForm owns
					    the offline path — it explains the situation, relabels the button,
					    and writes a durable queue row instead of a doomed round trip. A
					    cashier finishing a sale offline is the whole reason the queue
					    exists, so this is the one entry point that must NOT be gated on
					    connectivity. The PDF download above still is: that one genuinely
					    needs the server. */}
			{!doc.document && (
				<Dialog>
					<DialogTrigger asChild>
						<Action testID="receipt-email-button">{t('receipt.email_receipt')}</Action>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>{t('receipt.email_receipt')}</DialogTitle>
						</DialogHeader>
						<DialogBody>
							<EmailForm order={order} />
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
				onPress={() => doc.print().catch(() => undefined)}
				loading={doc.isPrinting || doc.isSyncing}
			>
				{t(doc.printedTo ? 'receipt.print_again' : 'receipt.print_receipt')}
			</Action>
		</>
	);
}
