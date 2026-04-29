/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';

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
});
