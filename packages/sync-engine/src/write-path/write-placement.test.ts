import { describe, expect, it } from 'vitest';

import type { QueuedMutation } from '@wcpos/sync-core';

import { coalescedPayload, decideWritePlacement } from './write-placement';

const row = (overrides: Partial<QueuedMutation> = {}): QueuedMutation => ({
	mutationId: 'm1',
	collectionName: 'orders',
	operation: 'update',
	recordId: 'order-1',
	origin: 'existing',
	payload: {},
	baseRevision: 'r1',
	queuedAt: '2026-08-07T00:00:00.000Z',
	...overrides,
});

const decide = (
	rows: readonly QueuedMutation[],
	overrides: Partial<Parameters<typeof decideWritePlacement>[0]> = {}
) =>
	decideWritePlacement({
		rows,
		operation: 'update',
		isRecovery: false,
		canCoalesce: true,
		hasBaseRevision: true,
		...overrides,
	});

describe('decideWritePlacement', () => {
	it('refuses a recovery when the same read contains a delete', () => {
		expect(decide([row({ operation: 'delete' })], { isRecovery: true })).toEqual({
			kind: 'refuse-recovery-superseded-by-delete',
		});
	});

	it.each([
		[
			'coalescing disabled',
			{ operation: 'delete', canCoalesce: false },
			[row({ operation: 'create', attempts: 0 })],
		],
		['incoming operation is not delete', { operation: 'update' }, [row({ operation: 'create' })]],
		['head is not create', { operation: 'delete' }, [row({ operation: 'update' })]],
		[
			'whole row set is not pending',
			{ operation: 'delete' },
			[row({ operation: 'create' }), row({ mutationId: 'm2', status: 'claimed' })],
		],
		['a row was attempted', { operation: 'delete' }, [row({ operation: 'create', attempts: 1 })]],
	] as const)('does not annihilate when %s', (_name, overrides, rows) => {
		expect(decide(rows, overrides)).not.toMatchObject({ kind: 'annihilate' });
	});

	it('annihilates the complete never-pushed create-headed chain', () => {
		const rows = [row({ operation: 'create' }), row({ mutationId: 'm2' })];
		expect(decide(rows, { operation: 'delete' })).toEqual({ kind: 'annihilate', chain: rows });
	});

	it('coalesces only into the last pending never-attempted row', () => {
		const prior = row({ mutationId: 'last', operation: 'create' });
		expect(decide([row({ mutationId: 'first', status: 'claimed' }), prior])).toEqual({
			kind: 'coalesce',
			prior,
			operation: 'create',
		});
		expect(decide([row({ attempts: 1 })])).toEqual({
			kind: 'append',
			deferBaseRevision: false,
		});
	});

	it.each([
		['recovery update into ordinary work', true, row()],
		['ordinary work into a recovery', false, row({ requeuedFrom: 'dead-letter' })],
	] as const)('keeps %s independently resolvable', (_name, isRecovery, prior) => {
		expect(decide([prior], { isRecovery })).toMatchObject({
			kind: isRecovery ? 'append-if-unchanged' : 'append',
		});
	});

	it('conditionally appends a recovery against sorted non-rejected ids', () => {
		expect(
			decide(
				[
					row({ mutationId: 'z', attempts: 1 }),
					row({ mutationId: 'ignored', status: 'rejected' }),
					row({ mutationId: 'a', attempts: 1 }),
				],
				{ isRecovery: true }
			)
		).toEqual({ kind: 'append-if-unchanged', observedIds: ['a', 'z'] });
	});

	it.each([
		['revisionless delete with a claimed create ahead', 'delete', false, 'claimed', true],
		['non-delete with a claimed create ahead', 'update', false, 'claimed', false],
		['based delete with a claimed create ahead', 'delete', true, 'claimed', false],
		['revisionless delete with only a terminal create ahead', 'delete', false, 'conflicted', false],
	] as const)(
		'defers the base for %s',
		(_name, operation, hasBaseRevision, status, deferBaseRevision) => {
			expect(
				decide([row({ operation: 'create', status })], {
					operation,
					canCoalesce: false,
					hasBaseRevision,
				})
			).toEqual({ kind: 'append', deferBaseRevision });
		}
	);
});

describe('coalescedPayload', () => {
	it('layers resident, non-tombstone prior, then incoming payload', () => {
		expect(
			coalescedPayload({
				operation: 'update',
				residentPayload: { resident: true, shared: 'resident' },
				prior: row({ payload: { prior: true, shared: 'prior' } }),
				incomingPayload: { incoming: true, shared: 'incoming' },
			})
		).toEqual({ resident: true, prior: true, incoming: true, shared: 'incoming' });
	});

	it('never layers a prior delete tombstone and keeps an incoming delete bare', () => {
		const prior = row({ operation: 'delete', payload: { id: 'order-1' } });
		expect(
			coalescedPayload({
				operation: 'update',
				residentPayload: { status: 'pending' },
				prior,
				incomingPayload: { total: '12.00' },
			})
		).toEqual({ status: 'pending', total: '12.00' });
		expect(
			coalescedPayload({
				operation: 'delete',
				residentPayload: { status: 'pending' },
				prior,
				incomingPayload: { id: 'order-1' },
			})
		).toEqual({ id: 'order-1' });
	});
});
