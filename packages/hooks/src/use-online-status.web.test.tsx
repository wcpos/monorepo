import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { checkWebsiteReachability } from './check-website-reachability';
import { reportNetworkResponse } from './network-pulse';
import { OnlineStatusProvider, useOnlineStatus } from './use-online-status.web';

jest.mock('./check-website-reachability', () => ({
	checkWebsiteReachability: jest.fn(),
}));

const checkWebsiteReachabilityMock = jest.mocked(checkWebsiteReachability);

function StatusConsumer() {
	const { status } = useOnlineStatus();
	return <span data-testid="online-status">{status}</span>;
}

function renderProvider(wpAPIURL = 'https://example.com') {
	return render(
		<OnlineStatusProvider wpAPIURL={wpAPIURL}>
			<StatusConsumer />
		</OnlineStatusProvider>
	);
}

async function flushAsyncWork() {
	await act(async () => {
		await Promise.resolve();
	});
}

describe('OnlineStatusProvider web', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2030-01-01T00:00:00Z'));
		Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
		checkWebsiteReachabilityMock.mockReset();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('recovers when navigator.onLine stays false and an interval probe succeeds', async () => {
		Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
		checkWebsiteReachabilityMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
		renderProvider();
		await flushAsyncWork();

		expect(screen.getByTestId('online-status').textContent).toBe('offline');
		await act(async () => {
			jest.advanceTimersByTime(30000);
			await Promise.resolve();
		});

		expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
	});

	it('recovers after an offline window event on a later interval probe', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(true);
		renderProvider();
		await flushAsyncWork();

		act(() => window.dispatchEvent(new Event('offline')));
		expect(screen.getByTestId('online-status').textContent).toBe('offline');
		checkWebsiteReachabilityMock.mockClear();

		await act(async () => {
			jest.advanceTimersByTime(30000);
			await Promise.resolve();
		});
		expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
	});

	it('uses a fresh network pulse without probing', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(true);
		renderProvider();
		await flushAsyncWork();
		checkWebsiteReachabilityMock.mockClear();

		act(() => reportNetworkResponse('https://example.com'));
		act(() => jest.advanceTimersByTime(30000));

		expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
		expect(checkWebsiteReachabilityMock).not.toHaveBeenCalled();
	});

	it('probes when the latest network pulse is stale', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(true);
		renderProvider();
		await flushAsyncWork();
		checkWebsiteReachabilityMock.mockClear();

		act(() => reportNetworkResponse('https://example.com'));
		act(() => jest.advanceTimersByTime(30000));
		expect(checkWebsiteReachabilityMock).not.toHaveBeenCalled();

		await act(async () => {
			jest.advanceTimersByTime(30000);
			await Promise.resolve();
		});
		expect(checkWebsiteReachabilityMock).toHaveBeenCalledTimes(1);
	});

	it('does not trust a fresh pulse while the browser reports offline', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(false);
		renderProvider();
		await flushAsyncWork();

		// A pulse from just before the connection dropped is still inside the
		// 45s freshness window — it must not flip the dot back to available.
		act(() => reportNetworkResponse('https://example.com'));
		Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
		act(() => window.dispatchEvent(new Event('offline')));
		expect(screen.getByTestId('online-status').textContent).toBe('offline');
		checkWebsiteReachabilityMock.mockClear();

		await act(async () => {
			jest.advanceTimersByTime(30000);
			await Promise.resolve();
		});
		expect(checkWebsiteReachabilityMock).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('online-status').textContent).toBe('offline');
	});

	it('ignores network pulses from another site', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(false);
		renderProvider('https://current.example.com/wp-json/');
		await flushAsyncWork();
		expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');

		act(() => reportNetworkResponse('https://other.example.com/wp-json/'));
		expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');

		act(() => reportNetworkResponse('CURRENT.EXAMPLE.COM/wp-json'));
		expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
	});

	it('rechecks when the browser comes online during an active probe', async () => {
		Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
		let resolveFirst!: (reachable: boolean) => void;
		checkWebsiteReachabilityMock
			.mockImplementationOnce(
				() =>
					new Promise<boolean>((resolve) => {
						resolveFirst = resolve;
					})
			)
			.mockResolvedValueOnce(true);
		renderProvider();
		await flushAsyncWork();

		Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
		act(() => window.dispatchEvent(new Event('online')));
		await act(async () => {
			resolveFirst(false);
			await Promise.resolve();
		});

		expect(checkWebsiteReachabilityMock).toHaveBeenCalledTimes(2);
		expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
	});

	it('probes instead of trusting a pulse timestamp from the future', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(true);
		renderProvider('https://rollback.example.com/wp-json/');
		await flushAsyncWork();
		checkWebsiteReachabilityMock.mockClear();

		act(() => reportNetworkResponse('https://rollback.example.com/wp-json/'));
		jest.setSystemTime(new Date('2029-12-31T23:00:00Z'));
		await act(async () => {
			jest.advanceTimersByTime(30000);
			await Promise.resolve();
		});

		expect(checkWebsiteReachabilityMock).toHaveBeenCalledTimes(1);
	});

	it('marks a failed probe unavailable when navigator.onLine is true', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(false);
		renderProvider();
		await flushAsyncWork();

		expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');
	});
});
