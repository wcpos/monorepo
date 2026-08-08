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

function renderProvider() {
	return render(
		<OnlineStatusProvider wpAPIURL="https://example.com">
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

		act(() => reportNetworkResponse());
		act(() => jest.advanceTimersByTime(30000));

		expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
		expect(checkWebsiteReachabilityMock).not.toHaveBeenCalled();
	});

	it('probes when the latest network pulse is stale', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(true);
		renderProvider();
		await flushAsyncWork();
		checkWebsiteReachabilityMock.mockClear();

		act(() => reportNetworkResponse());
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
		act(() => reportNetworkResponse());
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

	it('marks a failed probe unavailable when navigator.onLine is true', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(false);
		renderProvider();
		await flushAsyncWork();

		expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');
	});
});
