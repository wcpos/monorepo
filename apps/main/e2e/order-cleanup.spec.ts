import { expect, test } from '@playwright/test';

import {
	chunk,
	extractOrderIdFromPushBody,
	extractOrderNumberFromPushBody,
	FINALIZE_FROM_STATUSES,
	RETAINED_FIXTURE_ORDER_IDS,
	selectOrdersToFinalize,
	shouldFinalizeStatus,
	TEARDOWN_TERMINAL_STATUS,
} from './order-cleanup';

/**
 * Pure-logic unit tests for the order-teardown decision functions. These touch no
 * browser, network, or store — they run standalone under every project.
 */
test.describe('order-cleanup pure logic', () => {
	test('extractOrderIdFromPushBody reads bare and enveloped shapes', () => {
		expect(extractOrderIdFromPushBody({ id: 123 })).toBe(123);
		expect(extractOrderIdFromPushBody({ id: '456' })).toBe(456);
		expect(extractOrderIdFromPushBody({ document: { id: 789 } })).toBe(789);
		expect(extractOrderIdFromPushBody({ record: { id: 42 } })).toBe(42);
		expect(extractOrderIdFromPushBody({ data: { id: 7 } })).toBe(7);
	});

	test('extractOrderNumberFromPushBody reads bare and enveloped shapes, falls back to null', () => {
		expect(extractOrderNumberFromPushBody({ number: 'SEQ-1001' })).toBe('SEQ-1001');
		expect(extractOrderNumberFromPushBody({ number: 1001 })).toBe('1001');
		expect(extractOrderNumberFromPushBody({ document: { number: '70954' } })).toBe('70954');
		expect(extractOrderNumberFromPushBody({ record: { number: ' 7 ' } })).toBe('7');
		expect(extractOrderNumberFromPushBody({ data: {} })).toBeNull();
		expect(extractOrderNumberFromPushBody({ number: '' })).toBeNull();
		expect(extractOrderNumberFromPushBody(null)).toBeNull();
	});

	test('extractOrderIdFromPushBody rejects non-positive-integer ids and junk', () => {
		expect(extractOrderIdFromPushBody(null)).toBeNull();
		expect(extractOrderIdFromPushBody('nope')).toBeNull();
		expect(extractOrderIdFromPushBody({})).toBeNull();
		expect(extractOrderIdFromPushBody({ id: 0 })).toBeNull();
		expect(extractOrderIdFromPushBody({ id: -5 })).toBeNull();
		expect(extractOrderIdFromPushBody({ id: 1.5 })).toBeNull();
		expect(extractOrderIdFromPushBody({ id: 'abc' })).toBeNull();
	});

	test('shouldFinalizeStatus only accepts finalize-able statuses', () => {
		expect(shouldFinalizeStatus('pos-open')).toBe(true);
		expect(shouldFinalizeStatus('completed')).toBe(false);
		expect(shouldFinalizeStatus('processing')).toBe(false);
		expect(shouldFinalizeStatus('cancelled')).toBe(false);
		expect(shouldFinalizeStatus(undefined)).toBe(false);
		expect(shouldFinalizeStatus(123)).toBe(false);
	});

	test('finalize policy: pos-open is finalized, cancelled is the terminal target', () => {
		expect([...FINALIZE_FROM_STATUSES]).toEqual(['pos-open']);
		expect(TEARDOWN_TERMINAL_STATUS).toBe('cancelled');
		// A genuine completed sale must never be a finalize source.
		expect(FINALIZE_FROM_STATUSES.has('completed')).toBe(false);
	});

	test('selectOrdersToFinalize keeps only pos-open, drops fixtures, dedupes', () => {
		const retainedId = [...RETAINED_FIXTURE_ORDER_IDS][0];
		const orders = [
			{ id: 1, status: 'pos-open' },
			{ id: 2, status: 'completed' }, // genuine sale — left alone
			{ id: 3, status: 'pos-open' },
			{ id: 3, status: 'pos-open' }, // duplicate
			{ id: retainedId, status: 'pos-open' }, // retained fixture — skipped
			{ id: 4, status: 'processing' },
		];
		expect(selectOrdersToFinalize(orders)).toEqual([1, 3]);
	});

	test('selectOrdersToFinalize respects a custom retain set', () => {
		const orders = [
			{ id: 10, status: 'pos-open' },
			{ id: 11, status: 'pos-open' },
		];
		expect(selectOrdersToFinalize(orders, new Set([11]))).toEqual([10]);
	});

	test('chunk splits into fixed-size groups without dropping items', () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunk([], 50)).toEqual([]);
		expect(chunk([1, 2, 3], 0)).toEqual([[1], [2], [3]]); // step floored to 1
	});
});
