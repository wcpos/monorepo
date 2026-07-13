import * as React from 'react';

import { useNavigationState } from 'expo-router/react-navigation';
import get from 'lodash/get';
import {
	ObservableResource,
	useObservableEagerState,
	useObservableState,
	useObservableSuspense,
} from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { of } from 'rxjs';
import { map } from 'rxjs/operators';

import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/dialog';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import {
	Modal,
	ModalAction,
	ModalBody,
	ModalClose,
	ModalContent,
	ModalFooter,
	ModalHeader,
	ModalTitle,
} from '@wcpos/components/modal';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { WebView } from '@wcpos/components/webview';
import { usePrint } from '@wcpos/printer';

import {
	getReceiptPreviewPaperWidth,
	ReceiptPreviewViewport,
} from './components/receipt-preview-viewport';
import { EmailForm } from './email';
import { useDownloadReceiptPdf } from './hooks/use-download-receipt-pdf';
import { useTemplateRenderer } from './hooks/use-template-renderer';
import { createCloudEnqueueFactory } from '../hooks/use-cloud-enqueue';
import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { MismatchBadge } from './mismatch-badge';
import { PrinterSwitcher } from './printer-switcher';
import { SyncingBadge } from './syncing-badge';
import { TemplateSwitcher } from './template-switcher';
import { useResolvedPrinter } from './hooks/use-resolved-printer';
import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';
import { useUISettings } from '../contexts/ui-settings';
import { TaxRatesContext } from '../contexts/tax-rates/provider';
import { resolvePriceNumDecimals } from '../contexts/tax-rates/resolve-price-num-decimals';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

const CHECKOUT_ROUTE_NAMES = ['Checkout', '(modals)/cart/[orderId]/checkout'] as const;

/**
 *
 */
export function Receipt({ resource }: Props) {
	const order = useObservableSuspense(resource);
	const t = useT();
	const iframeRef = React.useRef<HTMLIFrameElement>(null);
	const { store } = useAppState();
	const cloudHttp = useRestHttpClient();
	const cloudEnqueueFactory = React.useMemo(
		() => createCloudEnqueueFactory(cloudHttp),
		[cloudHttp]
	);
	const taxRates = React.useContext(TaxRatesContext);
	const storeDp = useObservableEagerState(store?.wc_price_decimals$) as number | undefined;
	const dp = resolvePriceNumDecimals({
		contextDp: taxRates?.priceNumDecimals,
		storeDp,
	});

	// Get the WC order ID for the receipts API
	const orderId = useObservableEagerState(order.id$ ?? of(undefined as number | undefined));

	// Legacy receipt URL from order links
	const links$ = order.links$ ?? of(undefined);
	const baseReceiptURL = useObservableState(
		links$.pipe(map((links) => get(links, ['receipt', 0, 'href']) as string | undefined)),
		get(order, ['links', 'receipt', 0, 'href']) as string | undefined
	);

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
	} = useTemplateRenderer({
		orderId,
		baseReceiptURL,
		mode: 'live',
		order,
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

	const { download: downloadReceiptPdf, isDownloading: isDownloadingPdf } = useDownloadReceiptPdf();
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

	const { print, isPrinting } = usePrint({
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
	});

	/**
	 * Allow auto print for checkout
	 */
	const { uiSettings } = useUISettings('pos-cart');
	const checkoutRef = React.useRef(false);
	const hasAutoPrintedRef = React.useRef(false);
	useNavigationState((state) => {
		if (CHECKOUT_ROUTE_NAMES.some((routeName) => state.routeNames.includes(routeName))) {
			checkoutRef.current = true;
		}
		return state;
	});

	// Reset auto-print guard when a new receipt is loaded
	React.useEffect(() => {
		hasAutoPrintedRef.current = false;
	}, [orderId]);

	/**
	 * Handle load — single-shot auto-print guard prevents duplicate prints on mode switch
	 */
	const handleLoad = () => {
		if (uiSettings.autoPrintReceipt && checkoutRef.current && !hasAutoPrintedRef.current) {
			hasAutoPrintedRef.current = true;
			print();
		}
	};

	/**
	 *
	 */
	if (!isRxDocument(order)) {
		return (
			<Modal>
				<ModalContent size="lg">
					<ModalHeader>
						<ModalTitle>
							<Text>{t('common.no_order_found')}</Text>
						</ModalTitle>
					</ModalHeader>
				</ModalContent>
			</Modal>
		);
	}

	/**
	 *
	 */
	return (
		<Modal>
			<ModalContent size="xl" className="h-full">
				<ModalHeader>
					<ModalTitle>
						<Text>{t('common.receipt')}</Text>
					</ModalTitle>
				</ModalHeader>
				<ModalBody contentContainerStyle={{ height: '100%' }}>
					<ErrorBoundary>
						<VStack className="h-full gap-2">
							<SyncingBadge isSyncing={isSyncing} />
							<TemplateSwitcher
								templates={templates}
								selectedId={selectedTemplateId}
								onSelect={setSelectedTemplateId}
								isOffline={isOffline}
							/>
							<PrinterSwitcher
								printers={allPrinters}
								printerSelection={printerSelection}
								resolvedPrinterId={resolvedPrinter?.id ?? null}
								onSelect={setPrinterSelection}
							/>
							<MismatchBadge message={mismatchWarning} />
							<ReceiptPreviewViewport
								key={previewKey}
								paperWidth={previewPaperWidth}
								contentSize={contentSize}
								zoomInLabel={t('receipt.zoom_in', 'Zoom in')}
								zoomOutLabel={t('receipt.zoom_out', 'Zoom out')}
								testID="receipt-preview"
							>
								<WebView
									ref={iframeRef as never}
									{...(renderedHtml != null
										? { srcDoc: renderedHtml }
										: { src: templateReceiptUrl || baseReceiptURL || '' })}
									onLoad={handleLoad}
									onMessage={() => {}}
									onContentSizeChange={handleContentSizeChange}
									className="h-full w-full"
								/>
							</ReceiptPreviewViewport>
						</VStack>
					</ErrorBoundary>
				</ModalBody>
				<ModalFooter>
					<ModalClose testID="receipt-close-button">{t('common.close')}</ModalClose>
					{!isOffline ? (
						<Dialog>
							<DialogTrigger asChild>
								<ModalAction>{t('receipt.email_receipt')}</ModalAction>
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
					) : (
						<ModalAction disabled>{t('receipt.email_receipt')}</ModalAction>
					)}
					<ModalAction
						testID="receipt-download-pdf-button"
						onPress={() => downloadReceiptPdf({ orderId, templateId: templateInfo?.id })}
						disabled={!canDownloadPdf}
						loading={isDownloadingPdf}
					>
						{t('receipt.download_pdf')}
					</ModalAction>
					<ModalAction
						testID="receipt-print-button"
						onPress={() => print()}
						loading={isPrinting || isSyncing}
					>
						{t('receipt.print_receipt')}
					</ModalAction>
				</ModalFooter>
			</ModalContent>
		</Modal>
	);
}
