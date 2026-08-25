/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { useSiteInfo } from './use-site-info';

const mockGet = jest.fn();
const mockIncrementalPatch = jest.fn();
const mockError = jest.fn();
const mockHttp = { get: mockGet };
const mockWakeCallbacks: (() => void)[] = [];
const mockSite = {
	wp_api_url: 'https://store.example.test/wp-json/',
	url: 'https://store.example.test',
	incrementalPatch: mockIncrementalPatch,
};

jest.mock('@wcpos/hooks/use-http-client', () => ({
	useHttpClient: () => mockHttp,
	// The real predicate — a hand-written stub here would ratify the test instead
	// of checking the guard the hook actually uses.
	isAsleepBlock: jest.requireActual('@wcpos/hooks/use-http-client/request-state-manager')
		.isAsleepBlock,
	requestStateManager: {
		onWake: (callback: () => void) => {
			mockWakeCallbacks.push(callback);
			return () => {
				const index = mockWakeCallbacks.indexOf(callback);
				if (index !== -1) mockWakeCallbacks.splice(index, 1);
			};
		},
	},
}));

jest.mock('@wcpos/utils/logger', () => ({
	...jest.requireActual('@wcpos/utils/logger'),
	// Delegate lazily: `request-state-manager` calls getLogger at module scope,
	// which the mock factory reaches before `mockError` is initialised.
	getLogger: () => ({
		error: (...args: unknown[]) => mockError(...args),
		debug: () => undefined,
		warn: () => undefined,
		info: () => undefined,
	}),
}));

const makeAsleepError = () =>
	Object.assign(new Error('App is in background'), {
		isPreFlightBlocked: true,
		blockCode: 'preflight-asleep',
		isSleeping: true,
	});

describe('useSiteInfo', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockWakeCallbacks.length = 0;
		mockGet.mockResolvedValue({
			status: 200,
			data: { wcpos_version: '1.9.6' },
		});
		mockIncrementalPatch.mockResolvedValue(undefined);
	});

	it('preserves the saved license when the site-info response omits it', async () => {
		renderHook(() => useSiteInfo({ site: mockSite as never }));

		await waitFor(() => expect(mockIncrementalPatch).toHaveBeenCalledTimes(1));

		expect(mockIncrementalPatch.mock.calls[0]?.[0]).not.toHaveProperty('license');
	});

	it('does not report an error when the request is blocked by the asleep pre-flight check', async () => {
		// Regression: mounting in a background tab logged the expected block as a
		// SYNC999 error row ("Failed to fetch site info | App is in background"),
		// which the transport layer itself already suppresses.
		mockGet.mockRejectedValue(makeAsleepError());

		const { result } = renderHook(() => useSiteInfo({ site: mockSite as never }));

		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(mockError).not.toHaveBeenCalled();
		expect(result.current.error).toBeNull();
	});

	it('still reports a genuine fetch failure', async () => {
		// The silence above must be specific to the sleep block: a real failure
		// still has to reach the log, or this guard hides outages.
		mockGet.mockRejectedValue(new Error('Network Error'));

		const { result } = renderHook(() => useSiteInfo({ site: mockSite as never }));

		await waitFor(() => expect(result.current.error).toBe('Network Error'));
		expect(mockError).toHaveBeenCalledWith(
			'Failed to fetch site info',
			expect.objectContaining({ code: 'SYNC999' })
		);
	});

	it('retries the deferred fetch when the app wakes', async () => {
		// Without the retry, wcpos_version — the value the plugin-compat gate reads —
		// stays stale for the whole session, because the effect only fires on mount.
		mockGet
			.mockRejectedValueOnce(makeAsleepError())
			.mockResolvedValue({ status: 200, data: { wcpos_version: '1.9.6' } });

		renderHook(() => useSiteInfo({ site: mockSite as never }));

		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
		expect(mockIncrementalPatch).not.toHaveBeenCalled();

		await act(async () => {
			for (const callback of [...mockWakeCallbacks]) callback();
		});

		await waitFor(() => expect(mockIncrementalPatch).toHaveBeenCalledTimes(1));
		expect(mockIncrementalPatch.mock.calls[0]?.[0]).toMatchObject({ wcpos_version: '1.9.6' });
	});
});
