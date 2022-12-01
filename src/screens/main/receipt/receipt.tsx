import * as React from 'react';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import WebView from '@wcpos/components/src/webview';
import log from '@wcpos/utils/src/logger';

import useOrders from '../../../contexts/orders';

export const Receipt = React.forwardRef((props, ref) => {
	const { data } = useOrders();
	const order = data?.[0]; // @TODO - findOne option
	const iframeRef = React.useRef<HTMLIFrameElement>();

	/**
	 *
	 */
	// React.useImperativeHandle(
	// 	ref,
	// 	() => {
	// 		return {
	// 			print() {
	// 				if (iframeRef.current && iframeRef.current.contentWindow) {
	// 					iframeRef.current.contentWindow.print();
	// 				} else {
	// 					iframeRef.current?.print();
	// 				}
	// 			},
	// 		};
	// 	},
	// 	[]
	// );

	return (
		<ErrorBoundary>
			<WebView
				ref={ref}
				src="https://test.com/wcpos-checkout/wcpos-receipt/74/?wcpos=1&template=default"
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
});
