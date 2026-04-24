import {
	deriveRefundDestinationOptions,
	supportsCheckoutContract,
	supportsOriginalMethodRefund,
} from './payment-gateway-contract';

describe('supportsCheckoutContract', () => {
	it('returns true only when supports_checkout is true', () => {
		expect(supportsCheckoutContract({ capabilities: { supports_checkout: true } } as never)).toBe(
			true
		);
		expect(supportsCheckoutContract({ capabilities: { supports_checkout: false } } as never)).toBe(
			false
		);
		expect(supportsCheckoutContract(null)).toBe(false);
	});
});

describe('supportsOriginalMethodRefund', () => {
	it('uses supports_provider_refunds instead of provider heuristics', () => {
		expect(
			supportsOriginalMethodRefund({
				id: 'stripe_terminal_for_woocommerce',
				provider: 'stripe',
				capabilities: { supports_provider_refunds: true },
			} as never)
		).toBe(true);
		expect(
			supportsOriginalMethodRefund({
				id: 'pos_cash',
				provider: 'wcpos',
				capabilities: { supports_provider_refunds: false },
			} as never)
		).toBe(false);
	});
});

describe('deriveRefundDestinationOptions', () => {
	it('always offers cash and only enables original_method when provider refunds are supported', () => {
		expect(
			deriveRefundDestinationOptions({
				id: 'stripe_terminal_for_woocommerce',
				capabilities: { supports_provider_refunds: true },
			} as never)
		).toEqual([
			{ value: 'original_method', enabled: true },
			{ value: 'cash', enabled: true },
		]);

		expect(
			deriveRefundDestinationOptions({
				id: 'pos_cash',
				capabilities: { supports_provider_refunds: false },
			} as never)
		).toEqual([
			{ value: 'original_method', enabled: false },
			{ value: 'cash', enabled: true },
		]);
	});
});
