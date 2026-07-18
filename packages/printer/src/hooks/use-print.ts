import * as React from 'react';

import { DEFAULT_THERMAL_TEMPLATE } from '../encoder/default-thermal-template';
import { mapReceiptData } from '../encoder/map-receipt-data';
import { prepareSystemPrintHtml } from '../print-html';
import { PrinterService } from '../printer-service';
import { useOptionalRasterize } from '../raster/rasterize-provider';
import { isOrderBasedCloudProfile } from '../transport/cloud-adapter';
import { printFromUrl } from './print-from-url';

import type { ReceiptData } from '../encoder/types';
import type { PrinterServiceOptions } from '../printer-service';
import type { PrinterProfile } from '../types';

interface UsePrintOptions {
	/** Receipt data for ESC/POS encoding. Accepts both the canonical shape
	 *  and the offline rendering shape — the mapper normalises automatically. */
	receiptData?: ReceiptData | Record<string, any>;
	/** HTML content for system print fallback */
	html?: string;
	/** Receipt URL — fetched and used as HTML for system print fallback */
	receiptUrl?: string;
	/** Template paper width used by system print shell. */
	paperWidth?: string | null;
	/** Active printer profile. If undefined, uses system print dialog. */
	printerProfile?: PrinterProfile;
	/** XML template content for thermal engine templates */
	templateXml?: string;
	/** Decimal places for the built-in thermal encoder path */
	decimals?: number;
	/** Engine type of the selected template */
	templateEngine?: string;
	/** Ref to the receipt iframe — used to extract HTML when fetch is blocked by CORS */
	iframeRef?: React.RefObject<HTMLIFrameElement | null>;
	/** Injected by the host app: builds the cloud queue enqueue fn for a profile. */
	cloudEnqueueFactory?: PrinterServiceOptions['cloudEnqueueFactory'];
	/** WooCommerce order id — required for order-based cloud providers (Epson/PrintNode). */
	orderId?: number;
	/** Server template id — required for order-based cloud providers (Epson/PrintNode). */
	templateId?: string;
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

function resolvePaperGeometry(paperWidth: string | null | undefined): {
	paperFrameClass: 'thermal-58' | 'thermal-80';
	maxWidthDots: number;
} {
	if (paperWidth === '58mm') return { paperFrameClass: 'thermal-58', maxWidthDots: 384 };
	return { paperFrameClass: 'thermal-80', maxWidthDots: 576 };
}

export function usePrint(options: UsePrintOptions) {
	const {
		receiptData,
		html,
		receiptUrl,
		paperWidth,
		printerProfile,
		templateXml,
		decimals,
		templateEngine,
		iframeRef,
		cloudEnqueueFactory,
		orderId,
		templateId,
		onBeforePrint,
		onAfterPrint,
		onPrintError,
	} = options;

	const [isPrinting, setIsPrinting] = React.useState(false);

	/** Track overlapping print calls so isPrinting stays true until all finish. */
	const activePrintsRef = React.useRef(0);

	const rasterize = useOptionalRasterize();

	const print = React.useCallback(async () => {
		activePrintsRef.current += 1;
		setIsPrinting(true);

		try {
			if (onBeforePrint) {
				await onBeforePrint();
			}

			const service = getService();
			service.setCloudEnqueueFactory(cloudEnqueueFactory);

			// Order-based cloud providers (Epson SDP, PrintNode) must NOT be rendered
			// client-side — Epson rejects raw payloads and PrintNode never polls. Send
			// an order job and let the server render + deliver. Branch here, before any
			// local rendering. Star CloudPRNT and unknown/legacy providers fall through
			// to the byte-rendering paths below (raw upload, unchanged).
			if (printerProfile && isOrderBasedCloudProfile(printerProfile)) {
				if (orderId == null) {
					throw new Error('Order-based cloud printing requires an order id');
				}
				if (!templateId) {
					throw new Error('Order-based cloud printing requires a template id');
				}
				await service.printOrderViaCloud(printerProfile, orderId, templateId);
			} else if (printerProfile && printerProfile.connectionType !== 'system' && receiptData) {
				const normalised = mapReceiptData(receiptData as Record<string, any>);

				if (printerProfile.fullReceiptRaster) {
					if (!rasterize) {
						throw new Error('fullReceiptRaster requires RasterizeProvider in the component tree.');
					}

					// Raster path: render → capture → encode inside the 'use dom' component,
					// then send the finished bytes via the existing printRaw.
					const effectiveTemplateXml =
						templateEngine === 'thermal' && templateXml ? templateXml : DEFAULT_THERMAL_TEMPLATE;
					const geometry = resolvePaperGeometry(paperWidth);
					const bytes = await rasterize({
						templateXml: effectiveTemplateXml,
						receiptData: normalised as Record<string, unknown>,
						maxWidthDots: geometry.maxWidthDots,
						paperFrameClass: geometry.paperFrameClass,
						encodeOptions: {
							language: printerProfile.language,
							columns: printerProfile.columns,
							printerModel: printerProfile.printerModel,
							emitEscPrintMode: printerProfile.emitEscPrintMode ?? true,
							openDrawer: printerProfile.autoOpenDrawer,
							drawerConnector: printerProfile.drawerConnector,
						},
					});
					await service.printRaw(bytes, printerProfile);
				} else if (templateEngine === 'thermal' && templateXml) {
					const geometry = resolvePaperGeometry(paperWidth);
					await service.printThermalTemplateForPrint(
						normalised,
						printerProfile,
						templateXml,
						geometry.maxWidthDots
					);
				} else {
					await service.printReceipt(normalised, printerProfile, undefined, decimals);
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
					await service.printHtml(
						prepareSystemPrintHtml({
							html: htmlContent,
							paperWidth,
						})
					);
				} else if (receiptUrl) {
					await printFromUrl(receiptUrl, (h) =>
						service.printHtml(
							prepareSystemPrintHtml({
								html: h,
								paperWidth,
							})
						)
					);
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
	}, [
		cloudEnqueueFactory,
		decimals,
		html,
		iframeRef,
		onAfterPrint,
		onBeforePrint,
		onPrintError,
		orderId,
		paperWidth,
		printerProfile,
		rasterize,
		receiptData,
		receiptUrl,
		templateEngine,
		templateId,
		templateXml,
	]);

	return { print, isPrinting };
}

export { prepareSystemPrintHtml };
