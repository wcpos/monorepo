import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { useReactToPrint } from 'react-to-print';
import { map } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { useModal } from '@wcpos/components/src/modal';
import WebView from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

export const ReceiptTemplate = ({ order }) => {
	const { setPrimaryAction } = useModal();
	const iframeRef = React.useRef<HTMLIFrameElement>();

	const receiptURL = useObservableState(
		order.links$.pipe(map((links) => get(links, ['receipt', 0, 'href']))),
		get(order, ['links', 'receipt', 0, 'href'])
	);

	// const handlePrint = useReactToPrint({
	// 	content: () => iframeRef.current,
	// 	pageStyle: 'html, body { height: 100%; width: 100%; }',
	// });

	const handlePrintReceipt = React.useCallback(() => {
		if (iframeRef.current && iframeRef.current.contentWindow) {
			iframeRef.current.contentWindow.postMessage({ action: 'wcpos-print-receipt' }, '*');
		}
	}, []);

	/**
	 *
	 */
	setPrimaryAction((prev) => ({
		...prev,
		action: handlePrintReceipt,
	}));

	return (
		<ErrorBoundary>
			<WebView
				ref={iframeRef}
				src={receiptURL}
				onLoad={() => {
					// setLoading(false);
				}}
				onMessage={(event) => {
					// log.debug(event);
				}}
				style={{ height: '100%' }}
			/>
		</ErrorBoundary>
	);
};
