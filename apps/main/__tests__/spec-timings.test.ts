jest.resetModules();

const timings = require('../e2e/spec-timings.json').timings as Record<string, number>;

describe('E2E shard timing weights', () => {
	it('applies the documented three-store coupon weight', () => {
		expect(timings['pos-coupon-apply.spec.ts']).toBe(210);
	});
});
