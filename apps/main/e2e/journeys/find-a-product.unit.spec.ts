import { expect, test } from '../test';
import {
	burstCanCarry,
	categoryCandidates,
	type ScanSettings,
	type WcCategory,
} from './find-a-product';

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

const term = (
	id: number,
	count: number,
	slug = `cat-${id}`,
	name = `Category ${id}`
): WcCategory => ({
	id,
	name,
	slug,
	count,
});

test.describe('categoryCandidates', () => {
	test('keeps the default category when it is the only one', () => {
		const only = term(1, 12, 'uncategorized', 'Uncategorized');
		expect(categoryCandidates([only])).toEqual([only]);
	});

	test('puts a larger merchant category before a smaller default one', () => {
		const ids = categoryCandidates([term(1, 2, 'uncategorized', 'Uncategorized'), term(2, 40)]);
		expect(ids.map((c) => c.id)).toEqual([2, 1]);
	});

	test('orders merchant categories smallest count first', () => {
		const ids = categoryCandidates([term(1, 30), term(2, 3), term(3, 9)]).map((c) => c.id);
		expect(ids).toEqual([2, 3, 1]);
	});

	test('drops an empty category and an untypeable name', () => {
		const picked = categoryCandidates([term(1, 0), term(2, 5, 'a-b', 'A &amp; B'), term(3, 7)]);
		expect(picked.map((c) => c.id)).toEqual([3]);
	});

	test('returns at most 10', () => {
		const many = Array.from({ length: 14 }, (_, i) => term(i + 1, i + 1));
		expect(categoryCandidates(many).map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});
});
