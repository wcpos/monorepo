import { describe, expect, it } from 'vitest';

import { heldOpenCartMutations, isOpenCartHoldCandidate } from './open-cart-hold';

import type { HoldCandidate } from './open-cart-hold';

function row(overrides: Partial<HoldCandidate> = {}): HoldCandidate {
	return {
		collectionName: 'orders',
		operation: 'update',
		recordId: 'order-1',
		status: 'pending',
		...overrides,
	};
}

describe('open-cart hold', () => {
	it('holds a pending, non-explicit order write', () => {
		expect(isOpenCartHoldCandidate(row())).toBe(true);
		// A pre-v2 row carries no status at all and is pending by definition.
		expect(isOpenCartHoldCandidate(row({ status: undefined }))).toBe(true);
	});

	it('never holds a row that is past the point the hold protects', () => {
		// Claimed = the push is already in flight; the terminal statuses are parked
		// on a human and are counted by their own surfaces.
		for (const status of ['claimed', 'conflicted', 'needs-revision', 'rejected'] as const) {
			expect(isOpenCartHoldCandidate(row({ status }))).toBe(false);
		}
		// The cashier asking for the push, and a release, both must reach the store.
		expect(isOpenCartHoldCandidate(row({ explicit: true }))).toBe(false);
		expect(isOpenCartHoldCandidate(row({ operation: 'delete' }))).toBe(false);
		// The hold is an ORDER rule: a stuck product edit is a stuck product edit.
		expect(isOpenCartHoldCandidate(row({ collectionName: 'products' }))).toBe(false);
	});

	it('holds only rows whose record is actually an open cart', () => {
		const rows = [row({ recordId: 'open' }), row({ recordId: 'settled' })];

		expect(heldOpenCartMutations(rows, new Set(['open']))).toEqual([rows[0]]);
		expect(heldOpenCartMutations(rows, new Set())).toEqual([]);
	});

	it('releases a whole record chain when an explicit push or a delete joins it', () => {
		// Mirrors the drain's `releaseRecords`: the release drains the record's
		// entire chain in FIFO order, so no row of it is held — and the count must
		// not hide work that is on its way to the store.
		const earlier = row({ recordId: 'order-1' });
		const explicit = row({ recordId: 'order-1', explicit: true });
		expect(heldOpenCartMutations([earlier, explicit], new Set(['order-1']))).toEqual([]);

		const removal = row({ recordId: 'order-1', operation: 'delete' });
		expect(heldOpenCartMutations([earlier, removal], new Set(['order-1']))).toEqual([]);

		// The release is record-scoped: another open cart's row stays held.
		const other = row({ recordId: 'order-2' });
		expect(
			heldOpenCartMutations([earlier, explicit, other], new Set(['order-1', 'order-2']))
		).toEqual([other]);
	});
});
