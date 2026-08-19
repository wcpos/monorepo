import { describe, expect, it } from 'vitest';

import {
	GUEST_CUSTOMER_ID,
	isGuestCustomer,
	isMiscProductLine,
	MISC_PRODUCT_ID,
} from './sentinels';

describe('woo sentinels', () => {
	it('recognizes the guest customer and nothing else', () => {
		expect(isGuestCustomer(GUEST_CUSTOMER_ID)).toBe(true);
		expect(isGuestCustomer(0)).toBe(true);
		expect(isGuestCustomer(1)).toBe(false);
		expect(isGuestCustomer(null)).toBe(false);
		expect(isGuestCustomer(undefined)).toBe(false);
	});

	it('recognizes a misc product line; the null tombstone is not misc', () => {
		expect(isMiscProductLine({ product_id: MISC_PRODUCT_ID })).toBe(true);
		expect(isMiscProductLine({ product_id: 0 })).toBe(true);
		expect(isMiscProductLine({ product_id: null })).toBe(false);
		expect(isMiscProductLine({})).toBe(false);
		expect(isMiscProductLine({ product_id: 7 })).toBe(false);
	});
});
