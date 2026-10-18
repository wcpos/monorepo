import { backoffMs, BASE_BACKOFF_MS, MAX_BACKOFF_MS } from './outbox-backoff';

describe('backoffMs', () => {
	it('doubles from the base and stops at the ceiling', () => {
		expect(backoffMs(1)).toBe(BASE_BACKOFF_MS);
		expect(backoffMs(2)).toBe(BASE_BACKOFF_MS * 2);
		expect(backoffMs(3)).toBe(BASE_BACKOFF_MS * 4);
		expect(backoffMs(50)).toBe(MAX_BACKOFF_MS);
	});
});
