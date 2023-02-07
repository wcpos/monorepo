import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { useReactToPrint } from 'react-to-print';
import { map } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { useModal } from '@wcpos/components/src/modal';
import Text from '@wcpos/components/src/text';
import WebView from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

import useOrders from '../../contexts/orders';

export const ReceiptTemplate = () => {
	const { data: order } = useOrders();
	const { onPrimaryAction } = useModal();
	const iframeRef = React.useRef<HTMLIFrameElement>();

	const receiptURL = useObservableState(
		order.links$.pipe(map((links) => get(links, ['receipt', 0, 'href']))),
		get(order, ['links', 'receipt', 0, 'href'])
	);

	const handlePrint = useReactToPrint({
		content: () => iframeRef.current,
		pageStyle: 'html, body { height: 100%; width: 100%; }',
	});

	/**
	 *
	 */
	onPrimaryAction(handlePrint);

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
