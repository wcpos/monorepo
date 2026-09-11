import * as React from 'react';

import { usePrint } from '@wcpos/printer';
import { type EngineRecord, useDocField, useRecordField } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';

import { getReceiptPreviewPaperWidth } from './components/receipt-preview-viewport';
import { useDownloadReceiptPdf } from './hooks/use-download-receipt-pdf';
import { useTemplateRenderer } from './hooks/use-template-renderer';
import { useResolvedPrinter } from './hooks/use-resolved-printer';
import { createCloudEnqueueFactory } from '../hooks/use-cloud-enqueue';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { claimReceiptAutoPrint } from '../pos/checkout/checkout-mode';
import { useUISettings } from '../contexts/ui-settings';
import { useTaxSettingsOptional } from '../contexts/tax-rates/provider';
import { resolvePriceNumDecimals } from '../contexts/tax-rates/resolve-price-num-decimals';

export function useReceiptDocument({
	order,
	autoPrintAllowed,
}: {
	order: EngineRecord<'orders'>;
	autoPrintAllowed: boolean;
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
	const orderId = orderData.id;

	// Legacy receipt URL from order links
	const baseReceiptURL = orderData.links?.receipt?.[0]?.href;

	// Template renderer — provides template list, selection, and rendered output
	const {
		templates,
		selectedTemplateId,
		setSelectedTemplateId,
		renderedHtml,
		receiptData,
		receiptUrl: templateReceiptUrl,
		selectedTemplateEngine,
		selectedTemplateContent,
		isOffline,
		isSyncing,
		hasFinalData,
		preparePrintContent,
	} = useTemplateRenderer({
		orderId,
		baseReceiptURL,
		mode: 'live',
		order: orderData,
	});

	// Build template info for routing
	const selectedTemplate = templates.find((tmpl) => String(tmpl.id) === String(selectedTemplateId));
	const templateInfo = React.useMemo(() => {
		if (!selectedTemplate) return null;
		return {
			id: String(selectedTemplate.id),
			output_type: selectedTemplate.output_type ?? 'html',
			paper_width: selectedTemplate.paper_width ?? null,
		};
	}, [selectedTemplate]);

	const { download, isDownloading: isDownloadingPdf } = useDownloadReceiptPdf();
	const downloadReceiptPdf = () => download({ orderId, templateId: templateInfo?.id });
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

	const { print: printReceipt, isPrinting } = usePrint({
		preparePrint: async () => {
			let commit: (() => Promise<void>) | undefined;
			const prepared = await preparePrintContent(async () => {
				const local = order.getLatest().local as typeof order.local & {
					receiptPrintCount?: number;
				};
				const count = (local?.receiptPrintCount ?? 0) + 1;
				// Server and local counts are not reconciled: each counts what that party saw.
				commit = async () => {
					await order.incrementalModify((data) => {
						const local = data.local as typeof data.local & { receiptPrintCount?: number };
						if ((local?.receiptPrintCount ?? 0) >= count) return data;
						return {
							...data,
							local: {
								...local,
								dirty: local?.dirty ?? false,
								pendingMutationIds: local?.pendingMutationIds ?? [],
								receiptPrintCount: count,
							},
						};
					});
				};
				return count;
			});
			return { ...prepared, ...(commit ? { commit } : {}) };
		},
		receiptData: receiptData ?? undefined,
		html: renderedHtml ?? undefined,
		receiptUrl: templateReceiptUrl || baseReceiptURL,
		printerProfile: useSystemDialog ? undefined : (resolvedPrinter ?? undefined),
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
		orderId,
		templateId: templateInfo?.id,
		onBeforePrint: () =>
			getLogger(['wcpos', 'pos', 'receipt']).info('Receipt print attempted', {
				context: { event: 'receipt.print_attempted', orderId: order.uuid ?? orderId },
			}),
		onPrintError: (error) =>
			getLogger(['wcpos', 'pos', 'receipt']).error('Receipt print failed', {
				code: ERROR_CODES.PRINT_UNEXPECTED,
				context: {
					event: 'receipt.print_failed',
					orderId: order.uuid ?? orderId,
					error: error.message,
				},
			}),
	});

	const [printedTo, setPrintedTo] = React.useState<string | null>(null);
	const print = React.useCallback(
		() =>
			printReceipt().then(() => setPrintedTo(resolvedPrinter?.name ?? t('receipt.print_dialog'))),
		[printReceipt, resolvedPrinter?.name, t]
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
	const frameKey = `${order.uuid}:${previewKey}`;
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
	const autoPrintAttempted = attemptedFor === order.uuid;

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
			claimReceiptAutoPrint(order.uuid)
		) {
			hasAutoPrintedRef.current = true;
			setAttemptedFor(order.uuid);
			// Errors are logged via onPrintError; auto-print must not surface an unhandled rejection.
			print().catch(() => undefined);
		}
	}, [order.uuid, autoPrintAllowed, hasFinalData, frameKey, print, uiSettings.autoPrintReceipt]);

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
		autoPrintPending,
		templates,
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
			baseReceiptURL,
			iframeRef,
			handleLoad,
			handleError,
			handleContentSizeChange,
		},
	};
}
