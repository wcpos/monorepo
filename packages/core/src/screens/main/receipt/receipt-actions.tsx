import * as React from 'react';
import { Platform, View } from 'react-native';

import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	type FooterButton,
} from '@wcpos/components/dialog';
import type { EngineRecord } from '@wcpos/query';

import { EmailForm } from './email';
import { useT } from '../../../contexts/translations';
import { useSyncOrder } from '../hooks/use-sync-order';

import type { useReceiptDocument } from './use-receipt-document';

type ReceiptDocument = ReturnType<typeof useReceiptDocument>;

export function useReceiptActions(doc: ReceiptDocument, order: EngineRecord<'orders'>) {
	const t = useT();
	const { sync: syncOrder, loading, disabled } = useSyncOrder(order);
	const [emailOpen, setEmailOpen] = React.useState(false);
	const emailRef = React.useRef<View>(null);
	let sync: FooterButton | undefined;
	let dialog: React.ReactNode = null;
	let choices: FooterButton[] = [];
	if (!doc.document) {
		if (doc.unsaved) {
			sync = {
				label: t('pos_cart.sync_order'),
				testID: 'receipt-sync-order-button',
				onPress: () => void syncOrder(),
				loading,
				disabled,
			};
		}
		/** Reachable offline on purpose (#165). The 2026-03-06 stopgap
		 * (ba8729a77) disabled this button when the store was unreachable,
		 * because a send could only fail. It cannot any more: EmailForm owns
		 * the offline path — it explains the situation, relabels the button,
		 * and writes a durable queue row instead of a doomed round trip. A
		 * cashier finishing a sale offline is the whole reason the queue
		 * exists, so this is the one entry point that must NOT be gated on
		 * connectivity. The PDF download below still is: that one genuinely
		 * needs the server.
		 * An unsaved order cannot be emailed yet: the queue is keyed by numeric order id; this is the only gate besides document.
		 */
		choices = [
			{
				label: t('receipt.email_receipt'),
				testID: 'receipt-email-button',
				ref: emailRef,
				disabled: doc.unsaved,
				onPress: () => setEmailOpen(true),
			},
		];
		dialog = (
			<Dialog open={emailOpen} onOpenChange={setEmailOpen}>
				<DialogContent
					closeLabel={t('common.close')}
					onCloseAutoFocus={(event) => {
						if (Platform.OS === 'web') {
							event.preventDefault();
							(emailRef.current as unknown as HTMLElement | null)?.focus({ preventScroll: true });
						}
					}}
				>
					<DialogHeader>
						<DialogTitle>{t('receipt.email_receipt')}</DialogTitle>
					</DialogHeader>
					<EmailForm order={order} localOnly={doc.isOffline} />
				</DialogContent>
			</Dialog>
		);
	}
	choices = [
		...choices,
		{
			label: t('receipt.download_pdf'),
			testID: 'receipt-download-pdf-button',
			onPress: () => void doc.downloadReceiptPdf(),
			disabled: !doc.canDownloadPdf,
			loading: doc.isDownloadingPdf,
		},
		{
			label: t(doc.printedTo ? 'receipt.print_again' : 'receipt.print_receipt'),
			testID: 'receipt-print-button',
			// One coded row and a toast on failure (a closed print dialog is a cancel).
			onPress: () => void doc.printAndReport(),
			disabled: doc.printHeld,
			loading: doc.isPrinting || doc.isSyncing,
		},
	];
	return { sync, choices, dialog };
}
