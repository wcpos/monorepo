import { describe, expect, it } from 'vitest';

import { isNeverPushedChain } from './drainMutationQueue';

import type { QueuedMutation } from './recordMutationQueue';

const row = (overrides: Partial<QueuedMutation> = {}): QueuedMutation => ({
	mutationId: 'm1',
	collectionName: 'orders',
	operation: 'create',
	recordId: 'order-1',
	origin: 'minted',
	payload: {},
	baseRevision: null,
	queuedAt: '2026-08-07T00:00:00.000Z',
	...overrides,
});

describe('isNeverPushedChain', () => {
	it.each([
		[
			'create-headed pending rows with zero attempts',
			[row(), row({ mutationId: 'm2', operation: 'update' })],
			true,
		],
		['an empty row set', [], false],
		['a non-create head', [row({ operation: 'update' })], false],
		['a claimed row', [row(), row({ mutationId: 'm2', status: 'claimed' })], false],
		['an attempted row', [row({ attempts: 1 })], false],
	] as const)('%s => %s', (_name, rows, expected) => {
		expect(isNeverPushedChain(rows)).toBe(expected);
	});
});
