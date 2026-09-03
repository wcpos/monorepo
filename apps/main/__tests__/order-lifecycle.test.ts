import { isPushOrdersResponse } from '../e2e/order-lifecycle';

jest.mock('@wcpos/utils/logger', () => ({
	log: { warn: jest.fn() },
}));

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

function pushResponse(status: number) {
	return {
		url: () => 'https://store.example/wp-json/wcpos/v2/push/orders',
		request: () => ({ method: () => 'POST' }),
		status: () => status,
	};
}

describe('isPushOrdersResponse', () => {
	it('waits through a rejected attempt while the app refreshes its credential', () => {
		expect(isPushOrdersResponse(pushResponse(401))).toBe(false);
		expect(isPushOrdersResponse(pushResponse(200))).toBe(true);
	});
});
