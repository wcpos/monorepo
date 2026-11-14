import { storeRequestFailureCode } from './store-request-failure-code';

describe('storeRequestFailureCode', () => {
	it('prefers the WordPress error code the HTTP client attached', () => {
		expect(storeRequestFailureCode({ wpCode: 'AUTH201', response: { status: 403 } })).toBe(
			'AUTH201'
		);
	});

	it('maps the HTTP status when there is no WordPress code', () => {
		expect(storeRequestFailureCode({ isAxiosError: true, response: { status: 503 } })).toBe(
			'SYNC131'
		);
		expect(storeRequestFailureCode({ isAxiosError: true, response: { status: 401 } })).toBe(
			'AUTH101'
		);
	});

	it('calls a request with no reply "store unreachable", and anything else unexpected', () => {
		expect(storeRequestFailureCode({ isAxiosError: true, message: 'Network Error' })).toBe(
			'SYNC121'
		);
		expect(storeRequestFailureCode(new Error('boom'))).toBe('CLIENT999');
	});
});
