/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from '@testing-library/react';

import { usePaymentGateways } from './use-payment-gateways';

const mockGet = jest.fn();

jest.mock('./use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: mockGet }),
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

	it('surfaces a fetch error and clears the resolved gateway', async () => {
		mockGet.mockRejectedValue(new Error('boom'));

		const { result } = renderHook(() => usePaymentGateways('pos_cash'));

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(result.current.gateway).toBeNull();
		expect(result.current.error).toBe('boom');
	});
});
