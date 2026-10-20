import * as React from 'react';

import { recordReceiptPrint } from '@wcpos/query/mutations';
import { type ReadonlyClosureDocument, recordClosurePrint } from '@wcpos/query/register-session';
import { isOrderBasedCloudProfile, usePrint } from '@wcpos/printer';
import { Toast } from '@wcpos/components/toast';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CATALOGUE } from '@wcpos/utils/logger/generated/error-codes.generated';

import { getReceiptPreviewPaperWidth } from './components/receipt-preview-viewport';
import { useDownloadReceiptPdf } from './hooks/use-download-receipt-pdf';
import { useTemplateRenderer } from './hooks/use-template-renderer';
import { useResolvedPrinter } from './hooks/use-resolved-printer';
import { createCloudEnqueueFactory } from '../hooks/use-cloud-enqueue';
import { classifyPrintFailure, reportPrintFailure } from '../hooks/use-print/print-failure';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { convertUTCStringToLocalDate } from '../../../hooks/use-local-date';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { claimReceiptAutoPrint } from '../pos/checkout/checkout-mode';
import { useUISettings } from '../contexts/ui-settings';
import { useTaxSettingsOptional } from '../contexts/tax-rates/provider';
import { resolvePriceNumDecimals } from '../contexts/tax-rates/resolve-price-num-decimals';

export function useReceiptDocument({
	order,
	autoPrintAllowed,
	getLocalClosure,
	isReprint,
	document,
	documentReady,
	localReport,
	formatReport,
	templateType,
	storeId,
	previewEnabled = true,
}: {
	getLocalClosure?: () => Promise<ReadonlyClosureDocument | null>;
	isReprint?: boolean;
	templateType?: 'receipt' | 'report' | 'closure';
	storeId?: number;
	previewEnabled?: boolean;
	order?: EngineRecord<'orders'>;
	autoPrintAllowed: boolean;
	document?: string;
	documentReady?: boolean;
	localReport?: Record<string, unknown>;
	formatReport?: (data: Record<string, unknown>) => Record<string, unknown>;
}) {
	const t = useT();
	const iframeRef = React.useRef<HTMLIFrameElement>(null);
	const { store } = useAppState();
	const cloudHttp = useRestHttpClient();
	const cloudEnqueueFactory = React.useMemo(
		() => createCloudEnqueueFactory(cloudHttp),
		[cloudHttp]
	);
	const taxRates = useTaxSettingsOptional();
	const storeDp = useDocField(store, (value) => value.wc_price_decimals) as number | undefined;
	const dp = resolvePriceNumDecimals({
		contextDp: taxRates?.priceNumDecimals,
		storeDp,
	});
	const orderData = useRecordField(order, (record) => record.payload);

	// Get the WC order ID for the receipts API
	const orderId = orderData?.id;

	// Legacy receipt URL from order links
	const baseReceiptURL = orderData?.links?.receipt?.[0]?.href;

	// Template renderer — provides template list, selection, and rendered output
	const {
		documentError,
		refetch,
		templates,
		templatesReady,
		selectedTemplateId,
		setSelectedTemplateId,
		renderedHtml,
		receiptData,
		serverReceiptData,
		receiptUrl: templateReceiptUrl,
		selectedTemplateEngine,
		selectedTemplateContent,
		isOffline,
		isSyncing,
		hasFinalData,
		preparePrintContent,
	} = useTemplateRenderer({
		orderId,
		isReprint,
		templateType,
		storeId,
		baseReceiptURL,
		mode: 'live',
		previewEnabled,
		document,
		documentReady,
		localReport,
		formatReport,
		order: orderData,
		nextLocalClosureCount: async () => {
			const closure = await getLocalClosure?.();
			return closure ? closure.getLatest().print_count + 1 : 0;
		},
	});

	// Build template info for routing
	const selectedTemplate = templates.find((tmpl) => String(tmpl.id) === String(selectedTemplateId));
	const templateInfo = React.useMemo(() => {
		if (!selectedTemplate)
			return localReport
				? { id: 'register-session', output_type: 'escpos', paper_width: null }
				: null;
		return {
			id: String(selectedTemplate.id),
			output_type: selectedTemplate.output_type ?? 'html',
			paper_width: selectedTemplate.paper_width ?? null,
		};
	}, [selectedTemplate, localReport]);

	const { download, isDownloading: isDownloadingPdf } = useDownloadReceiptPdf();
	const downloadReceiptPdf = () =>
		download({ orderId, templateId: templateInfo?.id, ...(document ? { document } : {}) });
	const canDownloadPdf = !isOffline && !isSyncing && Boolean(orderId && templateInfo?.id);

	const previewPaperWidth = React.useMemo(
		() =>
			getReceiptPreviewPaperWidth({
				output_type: selectedTemplate?.output_type,
				paper_width: selectedTemplate?.paper_width ?? null,
			}),
		[selectedTemplate]
	);

	// Content size measured from the rendered receipt frame — lets the preview
	// viewport track the real document instead of locking to fixed paper sizes.
	// The measurement is stored together with the previewKey it was taken for
	// and only applied while that template is still selected. Deriving (rather
	// than resetting state on switch) matters: the preview iframe fills the
	// canvas that this measurement sizes, and a document can never measure
	// narrower than its viewport — so a stale measurement that survives one
	// switch gets re-measured into place and the old paper size sticks forever.
	const previewKey = String(selectedTemplateId ?? 'legacy-receipt');
	const [measuredContent, setMeasuredContent] = React.useState<{
		key: string;
		size: { width: number; height: number };
	} | null>(null);
	const contentSize = measuredContent?.key === previewKey ? measuredContent.size : null;
	const activePreviewKey = React.useRef(previewKey);
	React.useLayoutEffect(() => {
		activePreviewKey.current = previewKey;
	}, [previewKey]);
	const handleContentSizeChange = React.useCallback(
		(event: { nativeEvent: { contentSize: { width: number; height: number } } }) => {
			if (activePreviewKey.current !== previewKey) return;
			const { width, height } = event.nativeEvent.contentSize;
			if (width <= 0 || height <= 0) return;
			setMeasuredContent((prev) =>
				prev && prev.key === previewKey && prev.size.width === width && prev.size.height === height
					? prev
					: { key: previewKey, size: { width, height } }
			);
		},
		[previewKey]
	);

	// Resolve printer for this template
	const {
		allPrinters,
		resolvedPrinter,
		printerSelection,
		setPrinterSelection,
		mismatchWarning,
		useSystemDialog,
	} = useResolvedPrinter({ template: templateInfo });

	// Order-only cloud jobs cannot name X/Z documents; use the existing HTML print contract.
	const sessionReport = !!localReport || templateType === 'closure';
	const reportSystemDialog =
		sessionReport && isOrderBasedCloudProfile(resolvedPrinter ?? undefined);
	const { print: printReceipt, isPrinting } = usePrint({
		preparePrint: async () => {
			let commit: (() => Promise<void>) | undefined;
			const prepared = await preparePrintContent(async () => {
				if (getLocalClosure) {
					const closure = await getLocalClosure();
					if (!closure) throw new Error('Local closure unavailable');
					const count = closure.getLatest().print_count + 1;
					commit = async () => {
						await recordClosurePrint(closure, count, () => new Date().toISOString());
					};
					return count;
				}
				if (!order) return 0;
				const local = order.getLatest().local as NonNullable<typeof order>['local'] & {
					receiptPrintCount?: number;
				};
				const count = (local?.receiptPrintCount ?? 0) + 1;
				// Server and local counts are not reconciled: each counts what that party saw.
				commit = async () => {
					await recordReceiptPrint(order, count);
				};
				return count;
			});
			if (prepared.commit) {
				const recordPrint = prepared.commit;
				commit = async () => {
					try {
						const marker = await recordPrint();
						const closure = marker && getLocalClosure ? await getLocalClosure() : null;
						if (marker && closure) {
							await recordClosurePrint(
								closure,
								marker.print_count,
								() => convertUTCStringToLocalDate(marker.last_printed_at_gmt).toISOString(),
								true
							);
						}
					} catch (error) {
						Toast.show({
							title: error instanceof Error ? error.message : t('reports.reprint_failed'),
						});
						throw error;
					}
				};
			}
			return { ...prepared, commit };
		},
		receiptData: receiptData ?? undefined,
		html: renderedHtml ?? undefined,
		receiptUrl: templateReceiptUrl || (document ? undefined : baseReceiptURL),
		printerProfile:
			useSystemDialog || reportSystemDialog
				? undefined
				: resolvedPrinter
					? { ...resolvedPrinter, ...(sessionReport ? { autoOpenDrawer: false } : {}) }
					: undefined,
		paperWidth: selectedTemplate?.paper_width ?? undefined,
		decimals: dp,
		templateEngine: selectedTemplateEngine ?? undefined,
		templateXml:
			selectedTemplateEngine === 'thermal' ? (selectedTemplateContent ?? undefined) : undefined,
		iframeRef,
		cloudEnqueueFactory,
		// Order-based cloud providers (Epson/PrintNode) send these instead of bytes;
		// the server renders + delivers. templateInfo.id is the server template id
		// (the same `wcpos_template` id the receipt URL uses as `?template=`).
		orderId: document ? undefined : orderId,
		templateId: document ? undefined : templateInfo?.id,
		onBeforePrint: () => {
			if (reportSystemDialog) Toast.show({ title: t('register.report_system_print') });
			getLogger(['wcpos', 'pos', 'receipt']).info('Receipt print attempted', {
				context: { event: 'receipt.print_attempted', orderId: order?.uuid ?? orderId },
			});
		},
	});

	const [printedTo, setPrintedTo] = React.useState<string | null>(null);
	const printDestination =
		(reportSystemDialog ? undefined : resolvedPrinter?.name) ?? t('receipt.print_dialog');
	// Failures are reported per INVOCATION (the transport rethrows), so a manual print
	// that fails while an autoprint is still in flight is never mislabelled PRINT101,
	// nor the reverse.
	const runPrint = React.useCallback(
		async (onFailure: (error: unknown) => void) => {
			if (
				(document?.startsWith('closure:') || document?.startsWith('xreport:')) &&
				(!selectedTemplate?.offline_capable || !selectedTemplate.content)
			) {
				// Refused before anything reached a printer: the view shows the inline
				// "choose a template" failure, so this is the one row, info and uncoded —
				// no PRINT code's summary (job failed, printer unreachable) is true here.
				getLogger(['wcpos', 'pos', 'receipt']).info(
					'Report print refused: the selected template cannot print this document',
					{
						context: {
							event: 'receipt.print_refused',
							document,
							templateId: selectedTemplate?.id ?? null,
							reason: selectedTemplate?.offline_capable ? 'no-content' : 'not-offline-capable',
						},
					}
				);
				throw new Error(t('reports.closure_template_required'));
			}
			let dispatched: boolean;
			try {
				dispatched = (await printReceipt()) === true;
			} catch (error) {
				onFailure(error);
				throw error;
			}
			if (dispatched) setPrintedTo(printDestination);
			return dispatched;
		},
		[printReceipt, printDestination, document, selectedTemplate, t]
	);
	// For hosts that show their own inline error (reports, closures): the row only, no
	// toast. A closed print dialog is a cancel (debug); a real failure carries its
	// classified code (PRINT201/PRINT301) at that code's severity.
	const print = React.useCallback(
		() =>
			runPrint((error) => {
				const logger = getLogger(['wcpos', 'pos', 'receipt']);
				const context = {
					event: 'receipt.print_failed',
					orderId: order?.uuid ?? orderId,
					error: getErrorMessage(error),
				};
				const failure = classifyPrintFailure(error);
				if (failure.cancelled) {
					logger.debug('Receipt print failed (cancelled)', { context });
					return;
				}
				const level = ERROR_CATALOGUE[failure.code].severity === 'error' ? 'error' : 'warn';
				logger[level]('Receipt print failed', { code: failure.code, context });
			}),
		[runPrint, order?.uuid, orderId]
	);
	// The receipt's Print button and the autoprint: a closed print dialog is a cancel
	// (debug); a real failure is one coded row and a toast, so neither can fail silently.
	const printAndReport = React.useCallback(
		(autoPrint = false) =>
			runPrint((error) =>
				reportPrintFailure(
					getLogger(['wcpos', 'pos', 'receipt']),
					'Receipt print failed',
					error,
					t,
					{
						autoPrint,
						context: { event: 'receipt.print_failed', orderId: order?.uuid ?? orderId },
					}
				)
			).catch(() => false),
		[runPrint, order?.uuid, orderId, t]
	);

	/**
	 * Allow auto print for checkout
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const hasAutoPrintedRef = React.useRef(false);
	// The frame guards are KEYED by the document they describe — order AND preview — like
	// `measuredContent` above: a template switch (or, should a host ever reuse this hook across
	// orders, a new order) remounts the WebView, and a guard left from the old frame would let
	// the auto-print fire — and finishing unblock — before the new preview has loaded. A
	// different key therefore reads as "loading" without anything having to reset it.
	type FrameState = 'loading' | 'loaded' | 'failed';
	const frameKey = `${document ?? order?.uuid}:${previewKey}`;
	const iframeLoadedRef = React.useRef<{ key: string; loaded: boolean }>({
		key: frameKey,
		loaded: false,
	});
	// Reactive twin of the ref, for `autoPrintPending`: the frame's own load and error events
	// settle the wait, so no timer stands in for them.
	const [frame, setFrame] = React.useState<{ key: string; state: FrameState }>({
		key: frameKey,
		state: 'loading',
	});
	const frameState: FrameState = frame.key === frameKey ? frame.state : 'loading';
	// The attempt belongs to an order: a new order on the same hook instance starts unattempted.
	const [attemptedFor, setAttemptedFor] = React.useState<string | null>(null);
	const autoPrintAttempted = attemptedFor === order?.uuid;

	// Reset auto-print guards when a new receipt is loaded
	React.useEffect(() => {
		hasAutoPrintedRef.current = false;
		// A key no preview can have: the guard reads as not loaded whatever template is active.
		iframeLoadedRef.current = { key: '', loaded: false };
	}, [orderId]);

	const attemptAutoPrint = React.useCallback(() => {
		if (
			uiSettings.autoPrintReceipt &&
			autoPrintAllowed &&
			iframeLoadedRef.current.key === frameKey &&
			iframeLoadedRef.current.loaded &&
			hasFinalData &&
			!hasAutoPrintedRef.current &&
			claimReceiptAutoPrint(order?.uuid ?? '')
		) {
			hasAutoPrintedRef.current = true;
			setAttemptedFor(order?.uuid ?? null);
			// Reported as PRINT101: the sale is saved, print it from the receipt.
			void printAndReport(true);
		}
	}, [
		order?.uuid,
		autoPrintAllowed,
		hasFinalData,
		frameKey,
		printAndReport,
		uiSettings.autoPrintReceipt,
	]);

	// Final API data can arrive without causing the receipt frame to load again.
	React.useEffect(() => {
		attemptAutoPrint();
	}, [attemptAutoPrint]);

	/**
	 * Handle load — single-shot auto-print guard prevents duplicate prints on mode switch
	 */
	const handleLoad = () => {
		iframeLoadedRef.current = { key: frameKey, loaded: true };
		setFrame({ key: frameKey, state: 'loaded' });
		attemptAutoPrint();
	};
	const handleError = () => setFrame({ key: frameKey, state: 'failed' });

	// True while a configured auto-print is still waiting: on the store round-trip, or on the
	// preview frame that has a document but has not loaded yet. Settled by the attempt itself,
	// by the frame failing, or by there being no document to print — never by a timer.
	const hasDocument = renderedHtml != null || Boolean(templateReceiptUrl || baseReceiptURL);
	const autoPrintPending =
		autoPrintAllowed &&
		Boolean(uiSettings.autoPrintReceipt) &&
		!autoPrintAttempted &&
		frameState !== 'failed' &&
		(isSyncing || (hasDocument && frameState !== 'loaded'));

	return {
		documentError,
		refetch,
		receiptData,
		serverReceiptData,
		...(document ? { document } : {}),
		autoPrintPending,
		templates,
		templatesReady,
		selectedTemplateId,
		setSelectedTemplateId,
		isOffline,
		isSyncing,
		hasFinalData,
		allPrinters,
		printerSelection,
		setPrinterSelection,
		resolvedPrinter,
		mismatchWarning,
		print,
		printAndReport,
		isPrinting,
		printedTo,
		canDownloadPdf,
		downloadReceiptPdf,
		isDownloadingPdf,
		orderId,
		previewProps: {
			previewKey,
			previewPaperWidth,
			contentSize,
			renderedHtml,
			receiptUrl: templateReceiptUrl,
			baseReceiptURL: document ? undefined : baseReceiptURL,
			iframeRef,
			handleLoad,
			handleError,
			handleContentSizeChange,
		},
	};
}
