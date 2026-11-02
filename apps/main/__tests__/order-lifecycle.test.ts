import { createPushOrdersResponseMatcher } from '../e2e/order-lifecycle';

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

describe('createPushOrdersResponseMatcher', () => {
	it('waits through the refreshable 401 and matches the completed retry', () => {
		const matches = createPushOrdersResponseMatcher();
		expect(matches(pushResponse(401))).toBe(false);
		expect(matches(pushResponse(200))).toBe(true);
	});

	it('matches a failed retry and other terminal failures immediately', () => {
		const matches = createPushOrdersResponseMatcher();
		expect(matches(pushResponse(401))).toBe(false);
		expect(matches(pushResponse(401))).toBe(true);
		expect(createPushOrdersResponseMatcher()(pushResponse(500))).toBe(true);
	});
});
