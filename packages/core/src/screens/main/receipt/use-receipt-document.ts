import * as React from 'react';

import { recordReceiptPrint } from '@wcpos/query/mutations';
import { ORDER_REFRESH_TIMEOUT_MS } from '@wcpos/query/record-readers';
import { type ReadonlyClosureDocument, recordClosurePrint } from '@wcpos/query/register-session';
import { isOrderBasedCloudProfile, usePrint, usesSystemPrintDialog } from '@wcpos/printer';
import { Toast } from '@wcpos/components/toast';
import { withBase } from '@wcpos/components/webview/with-base';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CATALOGUE } from '@wcpos/utils/logger/generated/error-codes.generated';

import { getReceiptPreviewPaperWidth } from './components/receipt-preview-viewport';
import { useDownloadReceiptPdf } from './hooks/use-download-receipt-pdf';
import { useTemplateRenderer } from './hooks/use-template-renderer';
import { useResolvedPrinter } from './hooks/use-resolved-printer';
import { printNeedsLoadedPreview } from './utils/print-needs-loaded-preview';
import { createCloudEnqueueFactory } from '../hooks/use-cloud-enqueue';
import { classifyPrintFailure, reportPrintFailure } from '../hooks/use-print/print-failure';
import { usePaymentGateways } from '../hooks/use-payment-gateways';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { convertUTCStringToLocalDate } from '../../../hooks/use-local-date';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { claimReceiptAutoPrint } from '../pos/checkout/checkout-mode';
import { isSettledOrderStatus } from '../pos/checkout/sale-completion';
import { useUISettings } from '../contexts/ui-settings';
import { useTaxSettingsOptional } from '../contexts/tax-rates/provider';
import { resolvePriceNumDecimals } from '../contexts/tax-rates/resolve-price-num-decimals';

// Bounds the receipt page read so a stalled read cannot hold the cashier: while it is pending no
// frame mounts, so the auto-print and the finish-sale buttons wait on it. It is not there to race
// the host: the page on a slow host answers in 12-15 s (run 39803114058), and it was the print
// path's own 10 s FETCH_TIMEOUT_MS that timed out there. Past it, the frame loads the URL as before.
const RECEIPT_PAGE_READ_TIMEOUT_MS = 20_000;

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
		templatesSynced,
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
		receiptDataIsServer,
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

	// The order's own link is the fallback for a store with no receipt template. While the
	// templates are still arriving it is not the answer yet: loading it then cost the cashier one
	// more full WordPress page, and the templated page right after it (run 39803114058).
	const templatesResolving = !document && templates.length === 0 && !templatesSynced && !isOffline;
	const fallbackURL = document || templatesResolving ? undefined : baseReceiptURL;
	// The receipt page is read ONCE per URL (order, template and mode are all in it): the preview
	// shows it as srcDoc and a dialog print prints the same HTML. A failed read (a cross-origin
	// host) falls back to the frame loading the URL, as before.
	const pageURL =
		!document && previewEnabled && !isOffline && renderedHtml == null
			? templateReceiptUrl || fallbackURL
			: undefined;
	const [page, setPage] = React.useState<{ url: string; html: string | null } | null>(null);
	React.useEffect(() => {
		if (!pageURL) return;
		const controller = new AbortController();
		let current = true;
		const settle = (html: string | null) => {
			if (!current) return;
			current = false;
			clearTimeout(deadline);
			setPage({ url: pageURL, html });
		};
		const deadline = setTimeout(() => {
			settle(null);
			controller.abort();
		}, RECEIPT_PAGE_READ_TIMEOUT_MS);
		Promise.resolve()
			.then(() => fetch(pageURL, { signal: controller.signal }))
			.then((response) => (response.ok ? response.text() : null))
			.then(settle, () => settle(null));
		return () => {
			current = false;
			clearTimeout(deadline);
			controller.abort();
		};
	}, [pageURL]);
	const pageHtml = (page?.url === pageURL && page?.html) || undefined;
	const previewHtml = renderedHtml ?? pageHtml ?? null;
	const previewPending =
		previewHtml == null && (templatesResolving || (!!pageURL && page?.url !== pageURL));

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
		mismatch,
		useSystemDialog,
		isResolving: isResolvingPrinter,
	} = useResolvedPrinter({ template: templateInfo });

	// Order-only cloud jobs cannot name X/Z documents; use the existing HTML print contract.
	const sessionReport = !!localReport || templateType === 'closure';
	const reportSystemDialog =
		sessionReport && isOrderBasedCloudProfile(resolvedPrinter ?? undefined);
	const printerProfile = React.useMemo(
		() =>
			useSystemDialog || reportSystemDialog
				? undefined
				: resolvedPrinter
					? { ...resolvedPrinter, ...(sessionReport ? { autoOpenDrawer: false } : {}) }
					: undefined,
		[useSystemDialog, reportSystemDialog, resolvedPrinter, sessionReport]
	);
	const { print: printReceipt, isPrinting } = usePrint({
		preparePrint: async () => {
			// The page the preview read, printed as the URL print always was: uncounted.
			// The preview frame has run the page's scripts, so its DOM is the printable document,
			// as the same-origin frame's DOM was before the page was read once (a receipt whose
			// script fills the body prints empty from the source). Before the frame has a body,
			// the source: the dialog adapter loads inline HTML from a data: URL, so the page's own
			// URL travels with it as <base> for relative stylesheets and logos (the frame does the
			// same via `src`). pageURL is set whenever pageHtml is.
			if (pageHtml && pageURL && (!printerProfile || usesSystemPrintDialog(printerProfile))) {
				const frameDocument = iframeRef.current?.contentDocument;
				return {
					html: frameDocument?.body?.childElementCount
						? frameDocument.documentElement.outerHTML
						: withBase(pageHtml, pageURL),
				};
			}
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
		html: previewHtml ?? undefined,
		receiptUrl: templateReceiptUrl || (document ? undefined : baseReceiptURL),
		printerProfile,
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

	// Only a print that reads the preview frame waits for it to load: on a slow site that
	// frame is a full WordPress page, and a thermal, cloud or pre-rendered print never uses
	// it. Until the printer is resolved the print path is unknown, so nothing starts.
	const needsLoadedPreview = React.useMemo(
		() =>
			printNeedsLoadedPreview({
				printerProfile,
				receiptData: receiptData ?? undefined,
				html: previewHtml ?? undefined,
			}),
		[printerProfile, receiptData, previewHtml]
	);
	// The receipt is entered before the bounded order refresh lands. If the receipt request
	// then fails (or the deadline passes), the only data is built from the local order, still
	// pos-open: printing it would hand the customer an "open / still payable" receipt and
	// spend the single shot. So the auto-print waits for the server's receipt or for the local
	// order to settle, by the same rule the pay window uses (the gateway's stored POS order
	// status, so a gateway that settles at `pending` counts); the manual Print button is not
	// gated. A missing status is not a settled order either: fail closed and wait for the server.
	const paymentMethod = orderData?.payment_method || null;
	const { gateway } = usePaymentGateways(paymentMethod, autoPrintAllowed && !!paymentMethod);
	const localStatus = orderData?.status;
	const localOrderSettled =
		!!localStatus && isSettledOrderStatus(localStatus, gateway?.settled_order_status);
	// Finishing waits on that too, but never for ever: the post-payment order refresh is
	// bounded at ORDER_REFRESH_TIMEOUT_MS, so a wait that outlives the same bound means the
	// local order will not settle from it. Past the deadline the buttons release and nothing
	// prints (the cashier can still press Print); a settle that lands later still auto-prints.
	const awaitingSettledData =
		autoPrintAllowed &&
		Boolean(uiSettings.autoPrintReceipt) &&
		hasFinalData &&
		!receiptDataIsServer &&
		!localOrderSettled;
	const [dataWaitExpiredFor, setDataWaitExpiredFor] = React.useState<string | null>(null);
	const dataWaitExpired = dataWaitExpiredFor === order?.uuid;
	React.useEffect(() => {
		if (!awaitingSettledData || dataWaitExpired) return;
		const uuid = order?.uuid ?? null;
		const timer = setTimeout(() => setDataWaitExpiredFor(uuid), ORDER_REFRESH_TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [awaitingSettledData, dataWaitExpired, order?.uuid]);
	const attemptAutoPrint = React.useCallback(() => {
		const frameLoaded = iframeLoadedRef.current.key === frameKey && iframeLoadedRef.current.loaded;
		if (
			uiSettings.autoPrintReceipt &&
			autoPrintAllowed &&
			!isResolvingPrinter &&
			(!needsLoadedPreview || frameLoaded) &&
			hasFinalData &&
			(receiptDataIsServer || localOrderSettled) &&
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
		isResolvingPrinter,
		localOrderSettled,
		needsLoadedPreview,
		printAndReport,
		receiptDataIsServer,
		uiSettings.autoPrintReceipt,
	]);

	// Final API data or the resolved printer can arrive without the receipt frame loading again.
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

	// True while a configured auto-print is still waiting: on the store round-trip, on the
	// printer, on the preview frame that has a document but has not loaded yet, or on settled
	// data. Settled by the attempt itself, by the frame failing, by there being no document to
	// print, or (the settled-data wait only) by the order refresh's bound.
	const hasDocument = renderedHtml != null || Boolean(templateReceiptUrl || baseReceiptURL);
	const autoPrintPending =
		autoPrintAllowed &&
		Boolean(uiSettings.autoPrintReceipt) &&
		!autoPrintAttempted &&
		frameState !== 'failed' &&
		(isSyncing ||
			isResolvingPrinter ||
			(needsLoadedPreview && hasDocument && frameState !== 'loaded') ||
			(awaitingSettledData && !dataWaitExpired));

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
		// A session report on an order-based cloud printer prints through the dialog instead.
		mismatch: reportSystemDialog ? null : mismatch,
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
			renderedHtml: previewHtml,
			receiptUrl: previewPending ? null : templateReceiptUrl,
			baseReceiptURL: previewPending ? undefined : fallbackURL,
			pending: previewPending,
			// The URL the shown page was read from, so its relative links resolve against the store.
			pageBase: pageHtml ? pageURL : undefined,
			iframeRef,
			handleLoad,
			handleError,
			handleContentSizeChange,
		},
	};
}
