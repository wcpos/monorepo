import { expect, test } from './test';
import { selectCashierSlot } from './cashier-slot';

test('maps indices 0..7 collision-free within each event band', () => {
	expect(Array.from({ length: 8 }, (_, index) => selectCashierSlot('pull_request', index))).toEqual(
		[1, 2, 3, 4, 5, 6, 7, 8]
	);
	expect(Array.from({ length: 8 }, (_, index) => selectCashierSlot('push', index))).toEqual([
		9, 10, 11, 12, 13, 14, 15, 16,
	]);
});

test('selects the band by event name and falls back to the local band', () => {
	expect(selectCashierSlot('pull_request', 0)).toBe(1);
	expect(selectCashierSlot('workflow_dispatch', 0)).toBe(9);
	expect(selectCashierSlot(undefined, 0)).toBe(9);
});
