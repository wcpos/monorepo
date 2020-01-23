import WebView from './webview';
export default WebView;

type SyntheticEvent = import('react').SyntheticEvent;

export type Props = {
	src: string;
	title?: string;
	onMessage?: (event: SyntheticEvent) => void;
	onError?: () => void;
	onLoad?: () => void;
};
