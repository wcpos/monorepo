// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { reconcileBucketPlan } from './reconcile-bucket-plan';

const empty = { prune: [], missing: [], changed: [], skippedDirty: [] };

// Terse builders — local entries default to the 'product' lane; overridden where the lane matters.
const L = (
	wooId: number,
	digest: string,
	extra: { objectType?: 'product' | 'variation'; dirty?: boolean } = {}
) => ({
	wooId,
	digest,
	objectType: extra.objectType ?? 'product',
	...(extra.dirty ? { dirty: true } : {}),
});
const S = (id: number, digest: string, objectType: 'product' | 'variation' = 'product') => ({
	id,
	digest,
	objectType,
});
const P = (wooId: number, objectType: 'product' | 'variation' = 'product') => ({
	wooId,
	objectType,
});

describe('reconcileBucketPlan', () => {
	it('prunes a local record the server no longer has (the core stale-record case)', () => {
		expect(reconcileBucketPlan([L(5, 'a')], [])).toEqual({ ...empty, prune: [P(5)] });
	});

	it('classifies a server record the client is missing', () => {
		expect(reconcileBucketPlan([], [S(5, 'a')])).toEqual({ ...empty, missing: [P(5)] });
	});

	it('classifies a record present both sides whose digest differs (incl. hook-bypass edits)', () => {
		expect(reconcileBucketPlan([L(5, 'old')], [S(5, 'new')])).toEqual({
			...empty,
			changed: [P(5)],
		});
	});

	it('does nothing when the digests match (in sync)', () => {
		expect(reconcileBucketPlan([L(5, 'a')], [S(5, 'a')])).toEqual(empty);
	});

	it('carries the lane per action so the executor routes products vs variations', () => {
		// A bucket holds both lanes (shared wp_posts id space). Prune a local variation; report a missing server variation.
		const plan = reconcileBucketPlan(
			[L(5, 'a', { objectType: 'variation' })],
			[S(9, 'b', 'variation')]
		);
		expect(plan.prune).toEqual([P(5, 'variation')]);
		expect(plan.missing).toEqual([P(9, 'variation')]); // lane recovered from the SERVER entry (no local row)
	});

	it('compares digests as strings — a >2^53 value that would collide as a Number stays distinct', () => {
		expect(reconcileBucketPlan([L(5, '9007199254740993')], [S(5, '9007199254740995')])).toEqual({
			...empty,
			changed: [P(5)],
		});
	});

	describe('dirty guard', () => {
		it('never prunes a dirty record the server lacks — surfaces it in skippedDirty', () => {
			expect(reconcileBucketPlan([L(5, 'a', { dirty: true })], [])).toEqual({
				...empty,
				skippedDirty: [P(5)],
			});
		});

		it('never classifies a dirty record whose digest differs as changed — surfaces it in skippedDirty', () => {
			expect(reconcileBucketPlan([L(5, 'old', { dirty: true })], [S(5, 'new')])).toEqual({
				...empty,
				skippedDirty: [P(5)],
			});
		});

		it('does not flag a dirty record that already matches the server (nothing would have happened)', () => {
			expect(reconcileBucketPlan([L(5, 'a', { dirty: true })], [S(5, 'a')])).toEqual(empty);
		});

		it('keeps a dirty resident record out of missing', () => {
			expect(reconcileBucketPlan([L(5, 'a', { dirty: true })], [S(5, 'a')]).missing).toEqual([]);
		});
	});

	it('handles empty buckets on both sides', () => {
		expect(reconcileBucketPlan([], [])).toEqual(empty);
	});

	it('composes all four outcomes in one bucket', () => {
		const local = [
			L(1, 'same'), // match → no-op
			L(2, 'old'), // differs → changed
			L(3, 'gone'), // server-absent → prune
			L(4, 'x', { dirty: true }), // dirty + server-absent → skippedDirty
		];
		const server = [S(1, 'same'), S(2, 'new'), S(6, 'fresh', 'variation')]; // 6: local-absent → missing (variation)
		expect(reconcileBucketPlan(local, server)).toEqual({
			prune: [P(3)],
			missing: [P(6, 'variation')],
			changed: [P(2)],
			skippedDirty: [P(4)],
		});
	});
});
