import { createPushOrdersResponseMatcher } from '../e2e/order-lifecycle';

jest.mock('@wcpos/utils/logger', () => ({
	log: { warn: jest.fn() },
}));

// Reset at module scope to avoid jest-expo's winter-runtime "require outside test scope" error.
jest.resetModules();

const RECORD = '0b5c3f4e-8a21-4d6f-9c7e-2f1a3b4c5d6e';
const OTHER = '7e6d5c4b-3a2f-4e1d-8c9b-0a1f2e3d4c5b';

function pushResponse(status: number, recordId = RECORD) {
	return {
		url: () => 'https://store.example/wp-json/wcpos/v2/push/orders',
		request: () => ({ method: () => 'POST', postDataJSON: () => ({ recordId }) }),
		status: () => status,
	};
}

describe('createPushOrdersResponseMatcher', () => {
	it('waits through the refreshable 401 and matches the completed retry', () => {
		const matches = createPushOrdersResponseMatcher(RECORD);
		expect(matches(pushResponse(401))).toBe(false);
		expect(matches(pushResponse(200))).toBe(true);
	});

	it('matches a failed retry and other terminal failures immediately', () => {
		const matches = createPushOrdersResponseMatcher(RECORD);
		expect(matches(pushResponse(401))).toBe(false);
		expect(matches(pushResponse(401))).toBe(true);
		expect(createPushOrdersResponseMatcher(RECORD)(pushResponse(500))).toBe(true);
	});

	it("does not let another record's 401 use up the retry", () => {
		const matches = createPushOrdersResponseMatcher(RECORD);
		expect(matches(pushResponse(401, OTHER))).toBe(false);
		expect(matches(pushResponse(401))).toBe(false);
		expect(matches(pushResponse(200))).toBe(true);
	});
});
