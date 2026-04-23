/**
 * @jest-environment jsdom
 */

import {
	createCheckoutIdempotencyKey,
	isTerminalCheckoutStatus,
	shouldUseContractCheckout,
} from './use-checkout-session';

jest.mock('expo-router', () => ({
	useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

jest.mock('../../../contexts/use-pull-document', () => ({
	usePullDocument: () => jest.fn(),
}));

jest.mock('../../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: { autoShowReceipt: false } }),
}));

jest.mock('../../../hooks/use-rest-http-client', () => ({
	useRestHttpClient: () => ({ get: jest.fn(), post: jest.fn() }),
}));

jest.mock('../../../hooks/use-stock-adjustment', () => ({
	useStockAdjustment: () => ({ stockAdjustment: jest.fn() }),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ success: jest.fn(), error: jest.fn() }),
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: { PAYMENT_GATEWAY_ERROR: 'PAYMENT_GATEWAY_ERROR' },
}));

describe('shouldUseContractCheckout', () => {
	it('opts built-in manual gateways into the new contract flow', () => {
		expect(
			shouldUseContractCheckout({
				id: 'pos_cash',
				provider: 'wcpos',
				pos_type: 'manual',
				capabilities: { supports_checkout: true },
			})
		).toBe(true);
	});

	it('keeps non-manual or third-party gateways on the legacy webview path', () => {
		expect(
			shouldUseContractCheckout({
				id: 'stripe_terminal_for_woocommerce',
				provider: 'stripe',
				pos_type: 'terminal',
				capabilities: { supports_checkout: true },
			})
		).toBe(false);
	});
});

describe('isTerminalCheckoutStatus', () => {
	it.each(['completed', 'failed', 'cancelled', 'awaiting_customer'])('%s is terminal', (status) => {
		expect(isTerminalCheckoutStatus(status)).toBe(true);
	});

	it('processing is non-terminal', () => {
		expect(isTerminalCheckoutStatus('processing')).toBe(false);
	});
});

describe('createCheckoutIdempotencyKey', () => {
	it('includes the order and gateway identifiers', () => {
		const key = createCheckoutIdempotencyKey(42, 'pos_cash');
		expect(key).toMatch(/^checkout-42-pos_cash-\d+$/);
	});
});
