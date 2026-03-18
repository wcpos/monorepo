import * as React from 'react';

import { mapReceiptData } from '../encoder/map-receipt-data';
import { PrinterService } from '../printer-service';
import { printFromUrl } from './print-from-url';

import type { ReceiptData } from '../encoder/types';
import type { PrinterProfile } from '../types';

interface UsePrintOptions {
	/** Receipt data for ESC/POS encoding. Accepts both the canonical shape
	 *  and the offline rendering shape — the mapper normalises automatically. */
	receiptData?: ReceiptData | Record<string, any>;
	/** HTML content for system print fallback */
	html?: string;
	/** Receipt URL — fetched and used as HTML for system print fallback */
	receiptUrl?: string;
	/** Active printer profile. If undefined, uses system print dialog. */
	printerProfile?: PrinterProfile;
	/** XML template content for thermal engine templates */
	templateXml?: string;
	/** Engine type of the selected template */
	templateEngine?: string;
	/** Ref to the receipt iframe — used to extract HTML when fetch is blocked by CORS */
	iframeRef?: React.RefObject<HTMLIFrameElement | null>;
	/** Callbacks */
	onBeforePrint?: () => void | Promise<void>;
	onAfterPrint?: () => void;
	onPrintError?: (error: Error) => void;
}

// Singleton service instance
let printerService: PrinterService | null = null;

function getService(): PrinterService {
	if (!printerService) {
		printerService = new PrinterService();
	}
	return printerService;
}

/**
 * Try to extract HTML from an iframe's contentDocument.
 * Returns null if the iframe is cross-origin or unavailable.
 */
function extractIframeHtml(
	iframeRef: React.RefObject<HTMLIFrameElement | null> | undefined
): string | null {
	if (!iframeRef?.current) return null;
	try {
		const doc = iframeRef.current.contentDocument;
		if (!doc) return null;
		return doc.documentElement.outerHTML;
	} catch {
		// Cross-origin — can't access contentDocument
		return null;
	}
}

export function usePrint(options: UsePrintOptions) {
	const [isPrinting, setIsPrinting] = React.useState(false);
	const optionsRef = React.useRef(options);
	optionsRef.current = options;

	/** Track overlapping print calls so isPrinting stays true until all finish. */
	const activePrintsRef = React.useRef(0);

	const print = React.useCallback(async () => {
		const {
			receiptData,
			html,
			receiptUrl,
			printerProfile,
			templateXml,
			templateEngine,
			iframeRef,
			onBeforePrint,
			onAfterPrint,
			onPrintError,
		} = optionsRef.current;

		activePrintsRef.current += 1;
		setIsPrinting(true);

		try {
			if (onBeforePrint) {
				await onBeforePrint();
			}

			const service = getService();

			if (printerProfile && printerProfile.connectionType !== 'system' && receiptData) {
				// Direct thermal printing — normalise shape then encode and send bytes
				const normalised = mapReceiptData(receiptData as Record<string, any>);
				if (templateEngine === 'thermal' && templateXml) {
					await service.printReceipt(normalised, printerProfile, undefined, templateXml);
				} else {
					await service.printReceipt(normalised, printerProfile);
				}
			} else {
				// System print fallback — need HTML content
				let htmlContent = html;

				// Try extracting from the visible iframe (works for same-origin / srcDoc)
				if (!htmlContent) {
					htmlContent = extractIframeHtml(iframeRef) ?? undefined;
				}

				// If we have HTML, print it directly
				if (htmlContent) {
					await service.printHtml(htmlContent);
				} else if (receiptUrl) {
					await printFromUrl(receiptUrl, (h) => service.printHtml(h));
				} else {
					throw new Error(
						'No printable content available (no HTML, no URL, no receipt data with printer profile)'
					);
				}
			}

			onAfterPrint?.();
		} catch (error) {
			onPrintError?.(error as Error);
			throw error;
		} finally {
			activePrintsRef.current -= 1;
			if (activePrintsRef.current <= 0) {
				activePrintsRef.current = 0;
				setIsPrinting(false);
			}
		}
	}, []);

	return { print, isPrinting };
}
