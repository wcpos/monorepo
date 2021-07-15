import * as React from 'react';
import Button from '../button';

type Props = {
	src: string;
	title?: string;
	onMessage?: (event: MessageEvent) => void;
	onLoad?: (event: React.SyntheticEvent<HTMLIFrameElement, Event>) => void;
	onError?: (event: React.SyntheticEvent<HTMLIFrameElement, Event>) => void;
};

const WebView: React.FC<Props> = ({ src, title, onError, onMessage, onLoad }) => {
	const [reload, setReload] = React.useState<number>(1);

	// eslint-disable-next-line consistent-return
	React.useEffect(() => {
		if (typeof onMessage === 'function') {
			window.addEventListener('message', onMessage);
			return () => {
				window.removeEventListener('message', onMessage);
			};
		}
	}, []);

	return (
		<>
			<Button
				title="Reload"
				onPress={() => {
					setReload((prev) => prev + 1);
				}}
			/>
			<iframe
				title={title}
				src={`${src}&reload=${reload}`}
				onLoad={onLoad}
				onError={onError}
				width="100%"
				height="100%"
			/>
		</>
	);
};

export default WebView;
