/** @jest-environment jsdom */
import * as React from 'react';
import { Platform as RNPlatform } from 'react-native';

import { act, cleanup, render, screen } from '@testing-library/react';

import { useBridge } from './bridge/use-bridge';
import { useHostCapabilities } from './capabilities/host';
import { MINI_APP_ORIGIN, MINI_APP_PROXY_SCOPES } from './catalog';
import { MiniAppHost } from './mini-app-host';

interface MockWebViewProps {
	onLoad?: () => void;
	onShouldStartLoadWithRequest?: (request: { url: string }) => boolean;
}

let mockWebViewProps: MockWebViewProps = {};
let mockReady = false;
let mockDialogClose: (() => void) | undefined;
const mockReset = jest.fn();
const mockSend = jest.fn();
const mockOnMessage = jest.fn();
const originalOS = RNPlatform.OS;

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
		...jest.requireActual('../../../../jest/footer.test-utils'),
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
// The real bridge module (kept for isUnderPin) imports uuid, whose ESM build Jest cannot load.
jest.mock('uuid', () => ({ v4: () => 'generated-id' }));
jest.mock('./bridge/use-bridge', () => ({
	...jest.requireActual('./bridge/use-bridge'),
	useBridge: jest.fn(() => ({
		onMessage: mockOnMessage,
		ready: mockReady,
		reset: mockReset,
		send: mockSend,
	})),
}));
jest.mock('./capabilities/host', () => ({ useHostCapabilities: jest.fn(() => ({})) }));
jest.mock('./capabilities/printers', () => ({ usePrinterCapabilities: () => ({}) }));
jest.mock('./catalog', () => ({
	MINI_APP_PROXY_SCOPES: jest.requireActual('./catalog').MINI_APP_PROXY_SCOPES,
	MINI_APP_ORIGIN: 'https://cdn.example/gh/wcpos/mini-apps@1',
	meetsMinAppVersion: () => true,
	useMiniAppCatalog: () => [
		{
			id: 'printer-wizard',
			title: { en: 'Printer wizard' },
			url: 'https://cdn.example/gh/wcpos/mini-apps@1/printer-wizard/index.html',
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

	it.each(['printer-wizard', 'constructor'])('passes only an own scope for %s', (id) => {
		render(<MiniAppHost id={id} onClose={jest.fn()} />);
		expect(jest.mocked(useHostCapabilities).mock.calls[0][1]).toBe(
			id === 'printer-wizard' ? MINI_APP_PROXY_SCOPES['printer-wizard'] : undefined
		);
	});

	it('pins the bridge to the app directory', () => {
		render(<MiniAppHost id="printer-wizard" onClose={jest.fn()} />);
		expect(jest.mocked(useBridge).mock.calls[0][1]).toBe(`${MINI_APP_ORIGIN}/printer-wizard`);
	});

	it('refuses navigation to another app directory in the same repo', () => {
		render(<MiniAppHost id="printer-wizard" onClose={jest.fn()} />);
		const shouldStart = mockWebViewProps.onShouldStartLoadWithRequest;
		expect(shouldStart?.({ url: `${MINI_APP_ORIGIN}/printer-wizard/step.html` })).toBe(true);
		expect(shouldStart?.({ url: `${MINI_APP_ORIGIN}/other-app/index.html` })).toBe(false);
	});

	afterEach(() => {
		cleanup();
		jest.clearAllTimers();
		jest.useRealTimers();
		RNPlatform.OS = originalOS;
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
		RNPlatform.OS = 'ios';
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

	it('navigation to another jsDelivr repo is refused', () => {
		render(<MiniAppHost id="printer-wizard" onClose={jest.fn()} />);
		const shouldStart = mockWebViewProps.onShouldStartLoadWithRequest;

		expect(
			shouldStart?.({ url: 'https://cdn.example/gh/wcpos/mini-apps@1/printer-wizard/step.html' })
		).toBe(true);
		expect(shouldStart?.({ url: 'https://cdn.example/gh/someone/else@1/index.html' })).toBe(false);
		expect(shouldStart?.({ url: 'https://cdn.example/gh/wcpos/mini-apps@10/index.html' })).toBe(
			false
		);
	});

	it.each(['web', 'android'] as const)(
		'on %s a second frame load after the handshake closes the bridge',
		(os) => {
			RNPlatform.OS = os;
			mockReady = true;
			render(<MiniAppHost id="printer-wizard" onClose={jest.fn()} />);

			act(() => mockWebViewProps.onLoad?.());
			expect(screen.getByTestId('mock-webview')).toBeTruthy();
			act(() => mockWebViewProps.onLoad?.());

			expect(mockReset).toHaveBeenCalledTimes(1);
			expect(screen.queryByTestId('mock-webview')).toBeNull();
			expect(screen.getByTestId('mock-fallback')).toBeTruthy();
		}
	);

	it.each(['web', 'android'] as const)(
		'on %s a second frame load before the handshake closes the bridge',
		(os) => {
			RNPlatform.OS = os;
			mockReady = false;
			render(<MiniAppHost id="printer-wizard" onClose={jest.fn()} />);
			act(() => mockWebViewProps.onLoad?.());
			act(() => mockWebViewProps.onLoad?.());
			expect(mockReset).toHaveBeenCalledTimes(2);
			expect(screen.queryByTestId('mock-webview')).toBeNull();
			expect(screen.getByTestId('mock-fallback')).toBeTruthy();
		}
	);

	it('on ios a second frame load after the handshake re-arms the bridge', () => {
		RNPlatform.OS = 'ios';
		mockReady = true;
		render(<MiniAppHost id="printer-wizard" onClose={jest.fn()} />);

		act(() => mockWebViewProps.onLoad?.());
		act(() => mockWebViewProps.onLoad?.());

		expect(mockReset).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('mock-webview')).toBeTruthy();
		expect(screen.queryByTestId('mock-fallback')).toBeNull();
	});
});
