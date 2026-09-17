import * as React from 'react';
import { View } from 'react-native';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { WebView } from '@wcpos/components/webview';

import { ReceiptPreviewViewport } from './components/receipt-preview-viewport';
import { PAPER_DIMENSIONS } from './components/receipt-preview-viewport-utils';
import { MismatchBadge } from './mismatch-badge';
import { PrinterSwitcher } from './printer-switcher';
import { SyncingBadge } from './syncing-badge';
import { TemplateSwitcher } from './template-switcher';
import { useT } from '../../../contexts/translations';

import type { useReceiptDocument } from './use-receipt-document';

// Keep the document visible while the WebView measures its content.
const MIN_FLOW_PREVIEW_HEIGHT = 384;

export function ReceiptBody({
	doc,
	selectsInline,
	hideSelects,
	fullWidth = false,
}: {
	doc: ReturnType<typeof useReceiptDocument>;
	selectsInline?: boolean;
	hideSelects?: boolean;
	fullWidth?: boolean;
}) {
	const t = useT();
	const [flowWidth, setFlowWidth] = React.useState(0);
	const {
		templates,
		selectedTemplateId,
		setSelectedTemplateId,
		isOffline,
		isSyncing,
		allPrinters,
		printerSelection,
		resolvedPrinter,
		setPrinterSelection,
		mismatchWarning,
	} = doc;
	const {
		previewKey,
		previewPaperWidth,
		contentSize,
		renderedHtml,
		receiptUrl,
		baseReceiptURL,
		iframeRef,
		handleLoad,
		handleError,
		handleContentSizeChange,
	} = doc.previewProps;
	// Keep the iframe at paper size, then scale its canvas just like the modal preview.
	const paper = PAPER_DIMENSIONS[previewPaperWidth];
	const canvasWidth = contentSize?.width ?? paper.width;
	const canvasHeight = contentSize?.height ?? paper.height;
	const flowScale = Math.min(1, flowWidth / canvasWidth);
	const frame = (
		<WebView
			testID="receipt-preview-frame"
			ref={iframeRef as never}
			{...(renderedHtml != null
				? { srcDoc: renderedHtml }
				: { src: receiptUrl || baseReceiptURL || '' })}
			onLoad={handleLoad}
			onError={handleError}
			onMessage={() => {}}
			onContentSizeChange={handleContentSizeChange}
			className="h-full w-full"
		/>
	);
	const templateSwitcher = (
		<TemplateSwitcher
			templates={templates}
			selectedId={selectedTemplateId}
			onSelect={setSelectedTemplateId}
			isOffline={isOffline}
		/>
	);
	const printerSwitcher = (
		<PrinterSwitcher
			printers={allPrinters}
			printerSelection={printerSelection}
			resolvedPrinterId={resolvedPrinter?.id ?? null}
			onSelect={setPrinterSelection}
		/>
	);
	return (
		<ErrorBoundary>
			<VStack className={fullWidth ? 'w-full gap-2' : 'min-h-0 flex-1 gap-2'}>
				<SyncingBadge isSyncing={isSyncing} />
				{hideSelects ? null : selectsInline ? (
					<HStack className="gap-2">
						<VStack className="flex-1">{templateSwitcher}</VStack>
						<VStack className="flex-1">{printerSwitcher}</VStack>
					</HStack>
				) : (
					<>
						{templateSwitcher}
						{printerSwitcher}
					</>
				)}
				<MismatchBadge message={mismatchWarning} />
				{renderedHtml == null && !(receiptUrl || baseReceiptURL) ? (
					// No paper canvas when there is nothing to draw on it: the viewport's
					// sheet is hard-coded white, so themed text would vanish on it in dark themes.
					<VStack className="bg-muted min-h-0 flex-1 items-center justify-center rounded-md border p-4">
						<Text testID="receipt-unavailable" className="text-muted-foreground text-center">
							{t('receipt.preview_unavailable')}
						</Text>
					</VStack>
				) : fullWidth ? (
					<View
						key={previewKey}
						testID="receipt-flow-preview"
						onLayout={(event) => setFlowWidth(event.nativeEvent.layout.width)}
						style={{
							width: '100%',
							height: Math.max(MIN_FLOW_PREVIEW_HEIGHT, canvasHeight * flowScale),
							overflow: 'hidden',
						}}
					>
						<View
							testID="receipt-flow-canvas"
							style={{
								width: canvasWidth,
								height: canvasHeight,
								transform: [{ scale: flowScale }],
								transformOrigin: 'top left',
							}}
						>
							{frame}
						</View>
					</View>
				) : (
					<ReceiptPreviewViewport
						key={previewKey}
						paperWidth={previewPaperWidth}
						contentSize={contentSize}
						zoomInLabel={t('receipt.zoom_in')}
						zoomOutLabel={t('receipt.zoom_out')}
						testID="receipt-preview"
					>
						{frame}
					</ReceiptPreviewViewport>
				)}
			</VStack>
		</ErrorBoundary>
	);
}
