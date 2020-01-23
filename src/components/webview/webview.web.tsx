import React from 'react';

type Props = import('./').Props;

const WebView = ({ src, title, onError, onMessage, onLoad }: Props) => {
	React.useEffect(() => {
		window.addEventListener('message', onMessage);
		return () => {
			window.removeEventListener('message', onMessage);
		};
	});

	return (
		<iframe title={title} src={src} onLoad={onLoad} onError={onError} width="100%" height="100%" />
	);
};

export default WebView;
