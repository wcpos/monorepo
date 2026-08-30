import * as React from 'react';

import { type NetInfoStateType, useNetInfoInstance } from '@react-native-community/netinfo';
import { act, render, screen } from '@testing-library/react';

import { OnlineStatusProvider, useOnlineStatus } from './use-online-status';
import { WEBSITE_UNAVAILABLE_CONFIRMATION_MS } from './website-unavailable-confirmation';

jest.mock('@react-native-community/netinfo', () => ({
	useNetInfoInstance: jest.fn(),
}));

const useNetInfoInstanceMock = jest.mocked(useNetInfoInstance);

function StatusConsumer() {
	const { status } = useOnlineStatus();
	return <span data-testid="online-status">{status}</span>;
}

function renderProvider(wpAPIURL: string) {
	return render(
		<OnlineStatusProvider wpAPIURL={wpAPIURL}>
			<StatusConsumer />
		</OnlineStatusProvider>
	);
}

function mockNetInfo(isConnected: boolean, isInternetReachable: boolean | null) {
	useNetInfoInstanceMock.mockReturnValue({
		netInfo: {
			type: 'other' as NetInfoStateType.other,
			isConnected,
			isInternetReachable,
			details: { isConnectionExpensive: false },
		},
		refresh: jest.fn(),
	});
}

function getLatestConfig() {
	const config = useNetInfoInstanceMock.mock.calls.at(-1)?.[1];
	if (!config) throw new Error('Expected NetInfo configuration');
	return config;
}

describe('OnlineStatusProvider', () => {
	beforeEach(() => {
		useNetInfoInstanceMock.mockReset();
		useNetInfoInstanceMock.mockReturnValue({
			netInfo: {
				type: 'other' as NetInfoStateType.other,
				isConnected: true,
				isInternetReachable: true,
				details: { isConnectionExpensive: false },
			},
			refresh: jest.fn(),
		});
	});

	it.each([
		['https://example.com/wp-json', 'https://example.com/wp-json/wcpos/v2/ping?wcpos=1'],
		['https://example.com/wp-json/', 'https://example.com/wp-json/wcpos/v2/ping?wcpos=1'],
		['https://example.com/?rest_route=/', 'https://example.com/?rest_route=/wcpos/v2/ping&wcpos=1'],
	])('derives the ping URL from %s', (wpAPIURL, expectedPingURL) => {
		renderProvider(wpAPIURL);

		expect(getLatestConfig().reachabilityUrl).toBe(expectedPingURL);
	});

	it('falls back to the REST index after a 404 and counts that probe as reachable', async () => {
		const wpAPIURL = 'https://example.com/wp-json/';
		renderProvider(wpAPIURL);
		const pingConfig = getLatestConfig();
		const reachabilityTest = pingConfig.reachabilityTest;
		if (!reachabilityTest) throw new Error('Expected reachability test');

		let isReachable = false;
		await act(async () => {
			isReachable = await reachabilityTest({ status: 404 } as Response);
		});

		expect(isReachable).toBe(true);
		expect(getLatestConfig().reachabilityUrl).toBe(wpAPIURL);
	});

	it('stays on the ping URL after a 200', async () => {
		renderProvider('https://example.com/wp-json/');
		const pingConfig = getLatestConfig();
		const reachabilityTest = pingConfig.reachabilityTest;
		if (!reachabilityTest) throw new Error('Expected reachability test');

		await expect(reachabilityTest({ status: 200 } as Response)).resolves.toBe(true);
		expect(getLatestConfig().reachabilityUrl).toBe(
			'https://example.com/wp-json/wcpos/v2/ping?wcpos=1'
		);
	});

	describe('unavailable confirmation (#1669)', () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it('stays available while a single failed ping is unconfirmed', () => {
			mockNetInfo(true, false);
			renderProvider('https://example.com/wp-json/');

			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');

			act(() => {
				jest.advanceTimersByTime(WEBSITE_UNAVAILABLE_CONFIRMATION_MS - 1);
			});

			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
		});

		it('declares the website unavailable once the failure lasts the window', () => {
			mockNetInfo(true, false);
			renderProvider('https://example.com/wp-json/');

			act(() => {
				jest.advanceTimersByTime(WEBSITE_UNAVAILABLE_CONFIRMATION_MS);
			});

			expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');
		});

		it('clears the pending verdict when the ping recovers inside the window', () => {
			mockNetInfo(true, false);
			const { rerender } = renderProvider('https://example.com/wp-json/');

			act(() => {
				jest.advanceTimersByTime(WEBSITE_UNAVAILABLE_CONFIRMATION_MS - 1000);
			});
			mockNetInfo(true, true);
			rerender(
				<OnlineStatusProvider wpAPIURL="https://example.com/wp-json/">
					<StatusConsumer />
				</OnlineStatusProvider>
			);

			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');

			act(() => {
				jest.advanceTimersByTime(WEBSITE_UNAVAILABLE_CONFIRMATION_MS * 2);
			});

			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
		});

		it('restarts the window when the ping fails again after recovering', () => {
			mockNetInfo(true, false);
			const { rerender } = renderProvider('https://example.com/wp-json/');
			const rerenderProvider = () =>
				rerender(
					<OnlineStatusProvider wpAPIURL="https://example.com/wp-json/">
						<StatusConsumer />
					</OnlineStatusProvider>
				);

			act(() => {
				jest.advanceTimersByTime(WEBSITE_UNAVAILABLE_CONFIRMATION_MS - 1000);
			});
			mockNetInfo(true, true);
			rerenderProvider();
			mockNetInfo(true, false);
			rerenderProvider();

			act(() => {
				jest.advanceTimersByTime(WEBSITE_UNAVAILABLE_CONFIRMATION_MS - 1);
			});
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');

			act(() => {
				jest.advanceTimersByTime(1);
			});
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');
		});

		it('restarts the window when the store URL changes', () => {
			mockNetInfo(true, false);
			const { rerender } = renderProvider('https://store-a.example.com/wp-json/');

			act(() => {
				jest.advanceTimersByTime(WEBSITE_UNAVAILABLE_CONFIRMATION_MS - 1000);
			});
			rerender(
				<OnlineStatusProvider wpAPIURL="https://store-b.example.com/wp-json/">
					<StatusConsumer />
				</OnlineStatusProvider>
			);

			// Store A's window would have closed here; its failures are not evidence
			// about store B.
			act(() => {
				jest.advanceTimersByTime(1000);
			});
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');

			act(() => {
				jest.advanceTimersByTime(WEBSITE_UNAVAILABLE_CONFIRMATION_MS);
			});
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');
		});

		it('reports a dropped device link immediately, without confirmation', () => {
			mockNetInfo(false, false);
			renderProvider('https://example.com/wp-json/');

			expect(screen.getByTestId('online-status').textContent).toBe('offline');
		});
	});
});
