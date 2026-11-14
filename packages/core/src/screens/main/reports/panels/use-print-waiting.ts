import { useT } from '../../../../contexts/translations';

import type { useReceiptDocument } from '../../receipt/use-receipt-document';

export function usePrintWaiting({
	doc,
	storeReady,
	dataReady,
	salesLane,
	refundsLane,
	needsRefunds,
}: {
	doc: Pick<
		ReturnType<typeof useReceiptDocument>,
		'templatesReady' | 'templates' | 'mismatch' | 'resolvedPrinter'
	>;
	storeReady: boolean;
	dataReady: boolean;
	salesLane: boolean;
	refundsLane: boolean;
	needsRefunds: boolean;
}) {
	const t = useT();
	const waiting:
		'store' | 'data' | 'orders' | 'refunds' | 'templates' | 'no-template' | 'printer' | null =
		!storeReady
			? 'store'
			: !dataReady
				? 'data'
				: salesLane
					? 'orders'
					: needsRefunds && refundsLane
						? 'refunds'
						: !doc.templatesReady
							? 'templates'
							: doc.templates.length === 0
								? 'no-template'
								: // Only a saved printer that mis-prints the template blocks; no printer
									// means the print dialog, which prints the preview as before.
									doc.mismatch && doc.resolvedPrinter
									? 'printer'
									: null;
	const waitingLabels = {
		store: t('reports.print_waiting_store'),
		data: t('reports.print_waiting_data'),
		orders: t('reports.print_waiting_orders'),
		refunds: t('reports.print_waiting_refunds'),
		templates: t('reports.print_waiting_templates'),
		'no-template': t('reports.print_no_local_template'),
		printer: t('reports.print_printer_mismatch'),
	};
	return { waiting, label: waiting ? waitingLabels[waiting] : null };
}
