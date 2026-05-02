import * as React from 'react';

type WebViewProps = {
	ref?: React.Ref<HTMLIFrameElement>;
	src: string;
	title?: string;
	onMessage?: (event: MessageEvent) => void;
	onLoad?: (event: React.SyntheticEvent<HTMLIFrameElement, Event>) => void;
	onError?: (event: React.SyntheticEvent<HTMLIFrameElement, Event>) => void;
};

function WebView({ ref, src, title, onError, onMessage, onLoad }: WebViewProps) {
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
}

export { WebView };
