import { describe, expect, it, vi } from 'vitest';

import { StoreScopeManager } from '@wcpos/sync-core';
import type { QueuedMutation, ScopeBound, ScopeDatabase, SyncEvent } from '@wcpos/sync-core';

import { type DeadLetter, deadLetterOutcomesForTick } from './dead-letter-outcome';

/** A real manager over in-memory databases, with a drain ticket captured in scope A. */
async function drainTicketInScopeA() {
	const manager = new StoreScopeManager({
		createDatabase: async () =>
			({
				listCollections: () => [],
				resetCollection: async () => undefined,
				pendingMutationIds: async () => [],
				close: async () => undefined,
			}) satisfies ScopeDatabase,
	});
	await manager.switchTo('a');
	let bound!: ScopeBound;
	await manager.runGuarded(async (ticket) => {
		bound = ticket;
	});
	return { manager, bound };
}

function deadLetter(
	collectionName: string,
	operation: 'create' | 'update',
	mutationId = 'm-1'
): DeadLetter {
	return {
		mutation: {
			mutationId,
			collectionName,
			operation,
			recordId: 'r-1',
		} as QueuedMutation,
		status: 403,
		reason: 'woocommerce_rest_cannot_edit',
		serverMessage: 'Sorry, you are not allowed to edit this resource.',
	};
}

/** The drain's own push.rejected for a dead letter, as drainMutationQueue emits it. */
const attempt = (dead: DeadLetter): SyncEvent => ({
	type: 'push.rejected',
	level: 'warn',
	collection: dead.mutation.collectionName,
	fields: { op: dead.mutation.operation, recordId: 'r-1', mutationId: 'm-1', status: 403 },
});

/** One row per emitted event: its type, plus whichever outcome marker it carries. */
const summary = (event: SyncEvent): string => {
	const fields = event.fields as Record<string, unknown> | undefined;
	const marker = ['revertPending', 'revertFailed', 'revertSkipped'].find(
		(field) => fields?.[field] === true
	);
	return marker ? `${event.type}:${marker}` : event.type;
};

/** Every revert continuation (a microtask chain) has run by the next macrotask. */
const settledMacrotask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type Row = {
	name: string;
	collection: string;
	operation: 'create' | 'update';
	revert: 'resolves' | 'rejects';
	bornLocalCreate: boolean;
	steps: ('settle' | 'abandon')[];
	expected: string[];
};

const rows: Row[] = [
	{
		name: 'an order dead letter is neither stamped nor given an outcome',
		collection: 'orders',
		operation: 'update',
		revert: 'resolves',
		bornLocalCreate: false,
		steps: ['settle', 'abandon'],
		expected: ['push.rejected'],
	},
	{
		name: 'catalogue, revert lands: stamped attempt, then auto-reverted',
		collection: 'products',
		operation: 'update',
		revert: 'resolves',
		bornLocalCreate: false,
		steps: ['settle'],
		expected: ['push.rejected:revertPending', 'queue.write.auto-reverted'],
	},
	{
		name: 'catalogue, revert fails: stamped attempt, then revertFailed',
		collection: 'variations',
		operation: 'update',
		revert: 'rejects',
		bornLocalCreate: false,
		steps: ['settle'],
		expected: ['push.rejected:revertPending', 'push.rejected:revertFailed'],
	},
	{
		name: 'born-local create: stamped attempt, then revertSkipped, never reverted',
		collection: 'customers',
		operation: 'create',
		revert: 'resolves',
		bornLocalCreate: true,
		steps: ['settle'],
		expected: ['push.rejected:revertPending', 'push.rejected:revertSkipped'],
	},
	{
		name: 'owed, then the tick threw: revertSkipped',
		collection: 'coupons',
		operation: 'update',
		revert: 'resolves',
		bornLocalCreate: false,
		steps: ['abandon'],
		expected: ['push.rejected:revertPending', 'push.rejected:revertSkipped'],
	},
	{
		name: 'settled, then the tick threw: no second outcome',
		collection: 'products',
		operation: 'update',
		revert: 'resolves',
		bornLocalCreate: false,
		steps: ['settle', 'abandon'],
		expected: ['push.rejected:revertPending', 'queue.write.auto-reverted'],
	},
];

type Scope = 'current' | 'switched before settle' | 'switch pending at settle';
const cases: (Row & { scope: Scope })[] = [
	...rows.flatMap((row) =>
		(['current', 'switched before settle'] as const).map((scope) => ({ ...row, scope }))
	),
	// The switch has bumped the epoch but still waits on the drain's guarded
	// write: the dead letter's ticket is already stale, so the outcome drops.
	{ ...rows[3]!, scope: 'switch pending at settle' },
];

describe('deadLetterOutcomesForTick', () => {
	it.each(cases)('$name ($scope)', async (row) => {
		const { manager, bound } = await drainTicketInScopeA();
		const emitted: SyncEvent[] = [];
		const revert = vi.fn(async () => {
			if (row.revert === 'rejects') throw new Error('revert fetch failed');
		});
		const outcomes = deadLetterOutcomesForTick({
			diagnostics: (event) => emitted.push(event),
			revert,
		});
		const dead = deadLetter(row.collection, row.operation);

		outcomes.observe(attempt(dead));
		outcomes.owe(bound, dead);
		if (row.scope === 'switched before settle') await manager.switchTo('b');
		let release = (): void => undefined;
		let switching: Promise<unknown> = Promise.resolve();
		if (row.scope === 'switch pending at settle') {
			const held = new Promise<void>((resolve) => {
				release = resolve;
			});
			void bound.guardWrite(() => held);
			switching = manager.switchTo('b');
			await vi.waitFor(() => expect(manager.epoch).toBeGreaterThan(bound.epoch));
			expect(manager.activeScope).toBe('a');
		}
		for (const step of row.steps) {
			if (step === 'settle') outcomes.settle('m-1', { bornLocalCreate: row.bornLocalCreate });
			else outcomes.abandon();
		}
		release();
		await switching;
		await settledMacrotask();

		// After a switch the outcome belongs to no log: the dead letter stays
		// parked for Store health, and only the drain-time attempt was logged.
		const expected = row.scope === 'current' ? row.expected : row.expected.slice(0, 1);
		expect(emitted.map(summary)).toEqual(expected);
		const reverts = row.steps.includes('settle') && row.expected.length > 1 && !row.bornLocalCreate;
		expect(revert).toHaveBeenCalledTimes(reverts ? 1 : 0);
	});

	it.each(['resolves', 'rejects'] as const)(
		'drops the outcome of a revert that %s after the store switched mid-revert, A→B→A included',
		async (outcome) => {
			const { manager, bound } = await drainTicketInScopeA();
			const emitted: SyncEvent[] = [];
			let finish!: () => void;
			const revert = vi.fn(
				() =>
					new Promise<void>((resolve, reject) => {
						finish = outcome === 'resolves' ? resolve : () => reject(new Error('cut short'));
					})
			);
			const outcomes = deadLetterOutcomesForTick({
				diagnostics: (event) => emitted.push(event),
				revert,
			});
			outcomes.owe(bound, deadLetter('products', 'update'));
			outcomes.settle('m-1', { bornLocalCreate: false });
			await manager.switchTo('b');
			await manager.switchTo('a');
			finish();
			await settledMacrotask();
			expect(emitted).toEqual([]);
		}
	);

	it('emits the outcome rows in the shapes the cashier log reads', async () => {
		const { bound } = await drainTicketInScopeA();
		const emitted: SyncEvent[] = [];
		const outcomes = deadLetterOutcomesForTick({
			diagnostics: (event) => emitted.push(event),
			revert: async () => undefined,
		});
		outcomes.owe(bound, deadLetter('products', 'update'));
		outcomes.settle('m-1', { bornLocalCreate: false });
		outcomes.owe(bound, { ...deadLetter('coupons', 'update', 'm-2'), status: undefined });
		outcomes.abandon();
		await settledMacrotask();
		expect(emitted).toEqual([
			{
				type: 'push.rejected',
				level: 'error',
				collection: 'coupons',
				fields: {
					op: 'update',
					recordId: 'r-1',
					mutationId: 'm-2',
					reason: 'woocommerce_rest_cannot_edit',
					serverMessage: 'Sorry, you are not allowed to edit this resource.',
					revertSkipped: true,
				},
			},
			{
				type: 'queue.write.auto-reverted',
				level: 'error',
				collection: 'products',
				message: 'Sorry, you are not allowed to edit this resource.',
				fields: {
					collection: 'products',
					recordId: 'r-1',
					mutationId: 'm-1',
					status: 403,
					reason: 'woocommerce_rest_cannot_edit',
					serverMessage: 'Sorry, you are not allowed to edit this resource.',
				},
			},
		]);
	});
});
