import * as React from 'react';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { HStack } from '@wcpos/components/hstack';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';
import { WebView } from '@wcpos/components/webview';

import { ReceiptPreviewViewport } from './components/receipt-preview-viewport';
import { MismatchBadge } from './mismatch-badge';
import { PrinterSwitcher } from './printer-switcher';
import { SyncingBadge } from './syncing-badge';
import { TemplateSwitcher } from './template-switcher';
import { useT } from '../../../contexts/translations';

import type { useReceiptDocument } from './use-receipt-document';

export function ReceiptBody({
	doc,
	selectsInline,
}: {
	doc: ReturnType<typeof useReceiptDocument>;
	selectsInline?: boolean;
}) {
	const t = useT();
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
		handleContentSizeChange,
	} = doc.previewProps;
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
			<VStack className="min-h-0 flex-1 gap-2">
				<SyncingBadge isSyncing={isSyncing} />
				{selectsInline ? (
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
				) : (
					<ReceiptPreviewViewport
						key={previewKey}
						paperWidth={previewPaperWidth}
						contentSize={contentSize}
						zoomInLabel={t('receipt.zoom_in')}
						zoomOutLabel={t('receipt.zoom_out')}
						testID="receipt-preview"
					>
						<WebView
							ref={iframeRef as never}
							{...(renderedHtml != null
								? { srcDoc: renderedHtml }
								: { src: receiptUrl || baseReceiptURL || '' })}
							onLoad={handleLoad}
							onMessage={() => {}}
							onContentSizeChange={handleContentSizeChange}
							className="h-full w-full"
						/>
					</ReceiptPreviewViewport>
				)}
			</VStack>
		</ErrorBoundary>
	);
}
