import { expect, test } from '../test';
import { burstCanCarry, type ScanSettings } from './find-a-product';

/**
 * Unit-style pins for J12's scan-code pick: no page, no store. A SKU the burst cannot carry makes
 * step 7 fail on the store's settings, not on the app, so the pick is pinned here instead.
 */
const scan: ScanSettings = { thresholdMs: 24, minChars: 8, prefixes: ['$'], suffixes: ['#'] };

test.describe('burstCanCarry', () => {
	test('carries a plain SKU', () => {
		expect(burstCanCarry('ABC-12345', scan)).toBe(true);
	});

	test('refuses a threshold of exactly 10 ms', () => {
		expect(burstCanCarry('ABC-12345', { ...scan, thresholdMs: 10 })).toBe(false);
	});

	test('refuses a SKU one under the minimum length', () => {
		expect(burstCanCarry('ABC-1234', { ...scan, minChars: 9 })).toBe(false);
	});

	test('refuses a SKU whose first character is a configured prefix', () => {
		expect(burstCanCarry('$ABC-12345', scan)).toBe(false);
	});

	test('refuses a SKU whose last character is a configured suffix', () => {
		expect(burstCanCarry('ABC-12345#', scan)).toBe(false);
	});
});
