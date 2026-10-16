/** @jest-environment jsdom */
import * as React from 'react';

import { act, cleanup, render, screen } from '@testing-library/react';

import { MiniAppHost } from './mini-app-host';

interface MockWebViewProps {
	onLoad?: () => void;
}

let mockWebViewProps: MockWebViewProps = {};
let mockReady = false;
let mockDialogClose: (() => void) | undefined;
const mockReset = jest.fn();
const mockSend = jest.fn();
const mockOnMessage = jest.fn();

jest.mock('@wcpos/components/webview', () => {
	const mockReact = jest.requireActual<typeof import('react')>('react');
	return {
		WebView: (props: MockWebViewProps) => {
			mockWebViewProps = props;
			return mockReact.createElement('div', { 'data-testid': 'mock-webview' });
		},
	};
});
jest.mock('@wcpos/components/dialog', () => {
	const PassThrough = ({ children }: { children?: React.ReactNode }) => children;
	return {
		Dialog: ({ children, onClose }: React.PropsWithChildren<{ onClose?: () => void }>) => {
			mockDialogClose = onClose;
			return children;
		},
		DialogBody: PassThrough,
		DialogContent: PassThrough,
		DialogHeader: PassThrough,
		DialogTitle: PassThrough,
	};
});
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children?: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/vstack', () => {
	const mockReact = jest.requireActual<typeof import('react')>('react');
	return {
		VStack: ({ children }: { children?: React.ReactNode }) =>
			mockReact.createElement('div', { 'data-testid': 'mock-fallback' }, children),
	};
});
jest.mock('uniwind', () => ({
	useCSSVariable: () => '#000000',
	useUniwind: () => ({ theme: 'light' }),
}));
jest.mock('./bridge/use-bridge', () => ({
	useBridge: () => ({
		onMessage: mockOnMessage,
		ready: mockReady,
		reset: mockReset,
		send: mockSend,
	}),
}));
jest.mock('./capabilities/host', () => ({ useHostCapabilities: () => ({}) }));
jest.mock('./capabilities/printers', () => ({ usePrinterCapabilities: () => ({}) }));
jest.mock('./catalog', () => ({
	MINI_APP_ORIGIN: 'https://mini-apps.example',
	meetsMinAppVersion: () => true,
	useMiniAppCatalog: () => [
		{
			id: 'printer-wizard',
			title: { en: 'Printer wizard' },
			url: 'https://mini-apps.example/printer-wizard/',
			capabilities: [],
			minAppVersion: '1.0.0',
			entry: [],
			platforms: ['web'],
		},
	],
}));
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ store: { id: 'store-1', name: 'Store' } }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ platform: 'web', platformVersion: '1', appVersion: '1.10.0' }),
}));
jest.mock('../../../hooks/use-locale', () => ({
	useLocale: () => ({ code: 'en', locale: 'en_US', shortCode: 'en' }),
}));

describe('MiniAppHost readiness deadline', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		mockWebViewProps = {};
		mockReady = false;
	});

	afterEach(() => {
		cleanup();
		jest.clearAllTimers();
		jest.useRealTimers();
	});

	it('notifies the mini-app once before dismissing with the cancelled result', () => {
		const onClose = jest.fn();
		const view = render(<MiniAppHost id="printer-wizard" onClose={onClose} />);
		act(() => mockDialogClose?.());
		expect(mockSend).toHaveBeenCalledWith('app.closing', { reason: 'user' });
		expect(onClose).toHaveBeenCalledWith('cancelled');
		expect(mockSend.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
		view.unmount();
		expect(mockSend).toHaveBeenCalledTimes(1);
	});

	it('restarts the 10 second handshake deadline on every document load', () => {
		render(<MiniAppHost id="printer-wizard" onClose={jest.fn()} />);

		act(() => mockWebViewProps.onLoad?.());
		act(() => jest.advanceTimersByTime(6_000));
		act(() => mockWebViewProps.onLoad?.());

		expect(mockReset).toHaveBeenCalledTimes(2);
		act(() => jest.advanceTimersByTime(9_999));
		expect(screen.queryByTestId('mock-fallback')).toBeNull();
		act(() => jest.advanceTimersByTime(1));
		expect(screen.getByTestId('mock-fallback')).toBeTruthy();
	});

	it('preserves a handshake completed before the initial load event', () => {
		mockReady = true;
		render(<MiniAppHost id="printer-wizard" onClose={jest.fn()} />);

		act(() => mockWebViewProps.onLoad?.());

		expect(mockReset).not.toHaveBeenCalled();
	});

	it('keeps the 30 second budget for a document that has not loaded', () => {
		render(<MiniAppHost id="printer-wizard" onClose={jest.fn()} />);

		act(() => jest.advanceTimersByTime(29_999));
		expect(screen.queryByTestId('mock-fallback')).toBeNull();
		act(() => jest.advanceTimersByTime(1));
		expect(screen.getByTestId('mock-fallback')).toBeTruthy();
	});
});
