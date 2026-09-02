import { describe, expect, it } from 'vitest';

import { exactSkuLegRequired } from './exact-sku-leg';

describe('exactSkuLegRequired', () => {
	it.each([
		[undefined, true],
		['', true],
		['garbage', true],
		['1.9.9', true],
		['1.10.7', true],
		['1.10.8', false],
		['1.10.8-beta', false],
		['1.10.12', false],
		['1.11.0', false],
		['2.0.0', false],
	] as const)('returns %s for %s', (version, expected) => {
		expect(exactSkuLegRequired(version)).toBe(expected);
	});
});
