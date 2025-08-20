import * as React from 'react';

import Button from '../button';

type WebViewProps = {
	src: string;
	title?: string;
	onMessage?: (event: MessageEvent) => void;
	onLoad?: (event: React.SyntheticEvent<HTMLIFrameElement, Event>) => void;
	onError?: (event: React.SyntheticEvent<HTMLIFrameElement, Event>) => void;
};

const WebViewBase = (
	{ src, title, onError, onMessage, onLoad }: WebViewProps,
	ref: React.Ref<HTMLIFrameElement>
) => {
	// React.useEffect(() => {
	// 	if (typeof onMessage === 'function') {
	// 		window.addEventListener('message', onMessage);
	// 		return () => {
	// 			window.removeEventListener('message', onMessage);
	// 		};
	// 	}
	// }, []);

	return (
		<iframe
			ref={ref}
			title={title}
			src={src}
			onLoad={onLoad}
			onError={onError}
			width="100%"
			height="100%"
			// @ts-ignore
			// allowpaymentrequest
			style={{ border: 'none' }}
		/>
	);
};

export const WebView = React.forwardRef(WebViewBase);
