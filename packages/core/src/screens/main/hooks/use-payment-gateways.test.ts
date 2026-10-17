/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

import { getLogger } from '@wcpos/utils/logger';

import { usePaymentGateways } from './use-payment-gateways';

const mockGet = jest.fn();
const mockHttp = { get: mockGet };

jest.mock('./use-rest-http-client', () => ({
	useRestHttpClient: () => mockHttp,
}));

describe('usePaymentGateways', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('loads the gateway collection and resolves a gateway by id', async () => {
		mockGet.mockResolvedValue({
			data: [
				{ id: 'pos_cash', capabilities: { supports_checkout: true } },
				{
					id: 'stripe_terminal_for_woocommerce',
					capabilities: { supports_provider_refunds: true },
				},
			],
		});

		const { result } = renderHook(() => usePaymentGateways('stripe_terminal_for_woocommerce'));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.gateway?.id).toBe('stripe_terminal_for_woocommerce');
		expect(result.current.error).toBeNull();
	});

	it('preserves the previous gateway collection when a refetch fails', async () => {
		mockGet.mockResolvedValue({
			data: [
				{ id: 'pos_cash', capabilities: { supports_checkout: false } },
				{ id: 'stripe', capabilities: { supports_checkout: true } },
			],
		});

		const { result } = renderHook(() => usePaymentGateways('stripe'));

		await waitFor(() => expect(result.current.gateway?.id).toBe('stripe'));
		mockGet.mockRejectedValueOnce(new Error('temporary outage'));

		let refetchResult: Awaited<ReturnType<typeof result.current.refetch>> | undefined;
		await act(async () => {
			refetchResult = await result.current.refetch();
		});

		expect(refetchResult).toEqual([
			{ id: 'pos_cash', capabilities: { supports_checkout: false } },
			{ id: 'stripe', capabilities: { supports_checkout: true } },
		]);
		expect(result.current.gateways).toEqual(refetchResult);
		expect(result.current.gateway?.id).toBe('stripe');
		expect(result.current.error).toBe('temporary outage');
	});

	it('surfaces a fetch error and clears the resolved gateway', async () => {
		mockGet.mockRejectedValue(new Error('boom'));

		const { result } = renderHook(() => usePaymentGateways('pos_cash'));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.gateway).toBeNull();
		expect(result.current.error).toBe('boom');
	});

	it('writes the one coded row for a failed catalog load (the transport row is forensic)', async () => {
		mockGet.mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true }));

		const { result } = renderHook(() => usePaymentGateways('pos_cash'));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(getLogger([]).warn).toHaveBeenCalledWith('Payment gateways could not be loaded', {
			code: 'SYNC121',
			context: { error: 'Network Error' },
		});
	});

	it('stays unresolved through an auth-cancelled load, then loads once auth completes', async () => {
		const { requestStateManager } = jest.requireActual('@wcpos/hooks/use-http-client') as {
			requestStateManager: { setAuthFailed(failed: boolean): void };
		};
		requestStateManager.setAuthFailed(true);
		mockGet
			.mockRejectedValueOnce(
				Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' })
			)
			.mockResolvedValueOnce({
				data: [{ id: 'stripe', capabilities: { supports_checkout: true } }],
			});

		const { result } = renderHook(() => usePaymentGateways('stripe'));

		await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
		await act(async () => {
			await Promise.resolve();
		});
		// Not resolved: checkout must not fall back to the legacy webview meanwhile.
		expect(result.current.loading).toBe(true);
		expect(result.current.error).toBeNull();
		expect(getLogger([]).warn).not.toHaveBeenCalledWith(
			'Payment gateways could not be loaded',
			expect.anything()
		);

		act(() => requestStateManager.setAuthFailed(false));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(mockGet).toHaveBeenCalledTimes(2);
		expect(result.current.gateway?.id).toBe('stripe');
	});

	it('gives every cancellation episode its own retry when no auth hold is latched', async () => {
		jest.useFakeTimers();
		try {
			const cancelled = () =>
				Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });
			const catalog = { data: [{ id: 'stripe', capabilities: { supports_checkout: true } }] };
			mockGet
				.mockRejectedValueOnce(cancelled())
				.mockResolvedValueOnce(catalog)
				.mockRejectedValueOnce(cancelled())
				.mockResolvedValueOnce(catalog);

			const { result } = renderHook(() => usePaymentGateways('stripe'));
			await act(async () => {
				await jest.advanceTimersByTimeAsync(1_000);
			});
			expect(mockGet).toHaveBeenCalledTimes(2);
			expect(result.current.loading).toBe(false);

			// A later refetch is cancelled again (a token refresh, no hold latched).
			await act(async () => {
				void result.current.refetch();
				await jest.advanceTimersByTimeAsync(0);
			});
			expect(result.current.loading).toBe(true);
			await act(async () => {
				await jest.advanceTimersByTimeAsync(1_000);
			});

			expect(mockGet).toHaveBeenCalledTimes(4);
			expect(result.current.loading).toBe(false);
			expect(result.current.gateway?.id).toBe('stripe');
		} finally {
			jest.useRealTimers();
		}
	});

	describe('retries after cancellation', () => {
		const cancelled = () =>
			Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });
		const catalog = { data: [{ id: 'stripe', capabilities: { supports_checkout: true } }] };

		beforeEach(() => jest.useFakeTimers());
		afterEach(() => jest.useRealTimers());

		it('retries every cancel and resolves once a load succeeds', async () => {
			mockGet
				.mockRejectedValueOnce(cancelled())
				.mockRejectedValueOnce(cancelled())
				.mockRejectedValueOnce(cancelled())
				.mockResolvedValueOnce(catalog);

			const { result } = renderHook(() => usePaymentGateways('stripe'));
			for (let tick = 0; tick < 3; tick += 1) {
				await act(async () => {
					await jest.advanceTimersByTimeAsync(0);
				});
				expect(result.current.loading).toBe(true);
				await act(async () => {
					await jest.advanceTimersByTimeAsync(1_000);
				});
			}

			expect(mockGet).toHaveBeenCalledTimes(4);
			expect(result.current.loading).toBe(false);
			expect(result.current.error).toBeNull();
			expect(result.current.gateway?.id).toBe('stripe');
		});

		it('keeps retrying through a long sign-in: 30 cancels, then success, resolves', async () => {
			for (let index = 0; index < 30; index += 1) mockGet.mockRejectedValueOnce(cancelled());
			mockGet.mockResolvedValueOnce(catalog);

			const { result } = renderHook(() => usePaymentGateways('stripe'));
			await act(async () => {
				await jest.advanceTimersByTimeAsync(29_000);
			});
			// Still pending after 29 s of cancels — never an empty "resolved" catalogue.
			expect(result.current.loading).toBe(true);
			expect(result.current.error).toBeNull();

			await act(async () => {
				await jest.advanceTimersByTimeAsync(2_000);
			});
			expect(mockGet).toHaveBeenCalledTimes(31);
			expect(result.current.loading).toBe(false);
			expect(result.current.gateway?.id).toBe('stripe');
		});

		it('stops retrying on unmount', async () => {
			mockGet.mockRejectedValue(cancelled());
			const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

			const { unmount } = renderHook(() => usePaymentGateways('stripe'));
			await act(async () => {
				await jest.advanceTimersByTimeAsync(0);
			});
			const callsAtUnmount = mockGet.mock.calls.length;
			unmount();
			await act(async () => {
				await jest.advanceTimersByTimeAsync(10_000);
			});

			expect(mockGet).toHaveBeenCalledTimes(callsAtUnmount);
			// No state update after unmount (React would warn through console.error).
			expect(errorSpy).not.toHaveBeenCalled();
			errorSpy.mockRestore();
		});
	});

	describe('cancellation while the auth hold is latched', () => {
		const { requestStateManager } = jest.requireActual('@wcpos/hooks/use-http-client') as {
			requestStateManager: { setAuthFailed(failed: boolean): void };
		};
		const cancelled = () =>
			Object.assign(new Error('canceled'), { name: 'CanceledError', code: 'ERR_CANCELED' });

		beforeEach(() => jest.useFakeTimers());
		afterEach(() => {
			act(() => requestStateManager.setAuthFailed(false));
			jest.useRealTimers();
		});

		it('sends nothing while the hold is latched, then loads once when it clears', async () => {
			act(() => requestStateManager.setAuthFailed(true));
			mockGet.mockRejectedValueOnce(cancelled()).mockResolvedValueOnce({
				data: [{ id: 'stripe', capabilities: { supports_checkout: true } }],
			});

			const { result } = renderHook(() => usePaymentGateways('stripe'));
			await act(async () => {
				await jest.advanceTimersByTimeAsync(30_000);
			});
			// No polling into the auth handler (each would toast "Please log in" again).
			expect(mockGet).toHaveBeenCalledTimes(1);
			expect(result.current.loading).toBe(true);

			await act(async () => {
				requestStateManager.setAuthFailed(false);
				await jest.advanceTimersByTimeAsync(0);
			});
			expect(mockGet).toHaveBeenCalledTimes(2);
			expect(result.current.loading).toBe(false);
			expect(result.current.gateway?.id).toBe('stripe');
		});

		it('stops a pending poll the moment the hold latches', async () => {
			mockGet.mockRejectedValueOnce(cancelled());

			renderHook(() => usePaymentGateways('stripe'));
			await act(async () => {
				await jest.advanceTimersByTimeAsync(0);
			});
			act(() => requestStateManager.setAuthFailed(true));
			await act(async () => {
				await jest.advanceTimersByTimeAsync(5_000);
			});

			expect(mockGet).toHaveBeenCalledTimes(1);
		});
	});
});
