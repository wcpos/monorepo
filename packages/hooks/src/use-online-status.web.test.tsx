import * as React from 'react';

import { act, render, screen } from '@testing-library/react';

import { checkWebsiteReachability } from './check-website-reachability';
import { reportNetworkResponse } from './network-pulse';
import { OnlineStatusProvider, useOnlineStatus } from './use-online-status.web';
import { WEBSITE_UNAVAILABLE_CONFIRMATION_MS } from './website-unavailable-confirmation';

jest.mock('./check-website-reachability', () => ({
	checkWebsiteReachability: jest.fn(),
}));

const checkWebsiteReachabilityMock = jest.mocked(checkWebsiteReachability);

/** Every status the provider has published this test, in order. */
const renderedStatuses: string[] = [];

function StatusConsumer() {
	const { status } = useOnlineStatus();
	renderedStatuses.push(status);
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

const PROBE_INTERVAL_MS = 30000;

/**
 * Drive interval probes. One is enough to confirm the verdict (#1669), because
 * the interval matches the confirmation window — but only when the earlier
 * failure is a full window old, which back-to-back queued checks never are.
 */
async function runProbes(count = 1) {
	for (let i = 0; i < count; i += 1) {
		await act(async () => {
			jest.advanceTimersByTime(PROBE_INTERVAL_MS);
			await Promise.resolve();
		});
	}
}

describe('OnlineStatusProvider web', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2030-01-01T00:00:00Z'));
		Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
		checkWebsiteReachabilityMock.mockReset();
		renderedStatuses.length = 0;
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
		await runProbes();
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

	it('stays offline when the browser disconnects during a failed probe', async () => {
		let resolveProbe!: (reachable: boolean) => void;
		checkWebsiteReachabilityMock.mockImplementationOnce(
			() =>
				new Promise<boolean>((resolve) => {
					resolveProbe = resolve;
				})
		);
		renderProvider();
		await flushAsyncWork();

		Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
		act(() => window.dispatchEvent(new Event('offline')));
		expect(screen.getByTestId('online-status').textContent).toBe('offline');

		await act(async () => {
			resolveProbe(false);
			await Promise.resolve();
		});

		expect(screen.getByTestId('online-status').textContent).toBe('offline');
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

	it('marks a sustained probe failure unavailable when navigator.onLine is true', async () => {
		checkWebsiteReachabilityMock.mockResolvedValue(false);
		// A host of its own: network-pulse state is module-global, so a pulse
		// reported by an earlier test would let the interval skip the probe.
		renderProvider('https://repeated-failure.example.com/wp-json/');
		await flushAsyncWork();
		await runProbes();

		expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');
	});

	describe('unavailable confirmation (#1669)', () => {
		it('stays available while a single failed probe is unconfirmed', async () => {
			checkWebsiteReachabilityMock.mockResolvedValue(false);
			renderProvider('https://single-failure.example.com/wp-json/');
			await flushAsyncWork();

			expect(checkWebsiteReachabilityMock).toHaveBeenCalledTimes(1);
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
		});

		it('never alarms when a transient failure is followed by a success', async () => {
			checkWebsiteReachabilityMock.mockResolvedValueOnce(false).mockResolvedValue(true);
			renderProvider('https://transient-blip.example.com/wp-json/');
			await flushAsyncWork();
			// Several windows' worth of time elapses; the site answered in between,
			// so no run of failure survives to trip the verdict.
			await runProbes(3);

			// Never merely "available again": the cashier's toast fires on the
			// transition, so the unavailable status must never have been published.
			expect(renderedStatuses).not.toContain('online-website-unavailable');
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
		});

		it('restarts the window after a success between failures', async () => {
			checkWebsiteReachabilityMock
				.mockResolvedValueOnce(false)
				.mockResolvedValueOnce(true)
				.mockResolvedValue(false);
			renderProvider('https://restarted-count.example.com/wp-json/');
			await flushAsyncWork();
			await runProbes(2); // success, then the first failure of a fresh run

			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');

			await runProbes();
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');
		});

		it('recovers on the first successful probe without waiting', async () => {
			checkWebsiteReachabilityMock.mockResolvedValue(false);
			renderProvider('https://immediate-recovery.example.com/wp-json/');
			await flushAsyncWork();
			await runProbes();
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');

			checkWebsiteReachabilityMock.mockResolvedValue(true);
			await runProbes(1);

			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
		});

		it('does not confirm two checks queued back-to-back by a wake', async () => {
			checkWebsiteReachabilityMock.mockResolvedValue(false);
			renderProvider('https://wake-burst.example.com/wp-json/');
			await flushAsyncWork();

			// Waking fires `online` and `visibilitychange` together: the second
			// check is queued and runs the instant the first finishes. Two failures
			// seconds apart are not 30s of failure.
			await act(async () => {
				window.dispatchEvent(new Event('online'));
				document.dispatchEvent(new Event('visibilitychange'));
				await Promise.resolve();
				await Promise.resolve();
				await Promise.resolve();
			});

			expect(checkWebsiteReachabilityMock.mock.calls.length).toBeGreaterThan(1);
			expect(renderedStatuses).not.toContain('online-website-unavailable');
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
		});

		it('drops failure evidence gathered against the previous store URL', async () => {
			checkWebsiteReachabilityMock.mockResolvedValue(false);
			const { rerender } = renderProvider('https://store-a.example.com/wp-json/');
			await flushAsyncWork();
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');

			// Hidden: the interval stops probing, so store A's single failure simply
			// ages past the window without ever being confirmed.
			Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
			act(() => {
				jest.advanceTimersByTime(WEBSITE_UNAVAILABLE_CONFIRMATION_MS * 2);
			});

			// Switching stores re-probes; that first failure is store B's first, and
			// store A's stale evidence must not confirm it.
			rerender(
				<OnlineStatusProvider wpAPIURL="https://store-b.example.com/wp-json/">
					<StatusConsumer />
				</OnlineStatusProvider>
			);
			await flushAsyncWork();

			expect(renderedStatuses).not.toContain('online-website-unavailable');
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-available');
		});

		it('keeps no evidence from a failure the browser attributes to a dropped link', async () => {
			checkWebsiteReachabilityMock.mockResolvedValue(false);
			Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
			renderProvider('https://dropped-link.example.com/wp-json/');
			await flushAsyncWork();
			expect(screen.getByTestId('online-status').textContent).toBe('offline');

			// Link back, site still down: the offline probe left no evidence behind,
			// so the full confirmation is still required.
			Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
			await runProbes(1);
			expect(screen.getByTestId('online-status').textContent).toBe('offline');

			await runProbes(1);
			expect(screen.getByTestId('online-status').textContent).toBe('online-website-unavailable');
		});
	});
});
