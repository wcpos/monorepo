/**
 * The receipt print-count stash has two writers — the pull's materialisation
 * retiring applied entries, and the previous-generation drain adding entries —
 * so every change is an atomic modification of the latest document, never a
 * read-modify-write of a snapshot (which drops the other writer's entries).
 */
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';
import { describe, expect, it } from 'vitest';

import { createEngineHarness } from '../testing';
import {
	RESYNC_RECEIPT_PRINT_COUNTS_ID,
	retireStashedPrintCounts,
	stashPrintCounts,
} from './engine-order-repository';

setPremiumFlag();

describe('the receipt print-count stash', () => {
	it('a drain merge interleaved with a pull retiring an entry: the merged entry survives', async () => {
		const harness = await createEngineHarness({ mode: 'manual' });
		try {
			const orders = harness.collection('orders') as never;
			await stashPrintCounts(orders, { A: 1, C: 3 });
			// The pull retires A while the drain stashes B: neither may undo the other.
			await Promise.all([
				retireStashedPrintCounts(orders, ['A']),
				stashPrintCounts(orders, { B: 2 }),
			]);
			const stash = await harness.collection('orders').getLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID);
			expect(stash?.get('counts')).toEqual({ B: 2, C: 3 });
		} finally {
			await harness.dispose();
		}
	});

	it('two drains stashing at once keep both, and the larger count for one order', async () => {
		const harness = await createEngineHarness({ mode: 'manual' });
		try {
			const orders = harness.collection('orders') as never;
			await Promise.all([
				stashPrintCounts(orders, { A: 1, B: 2 }),
				stashPrintCounts(orders, { A: 4, C: 1 }),
			]);
			const stash = await harness.collection('orders').getLocal(RESYNC_RECEIPT_PRINT_COUNTS_ID);
			expect(stash?.get('counts')).toEqual({ A: 4, B: 2, C: 1 });
		} finally {
			await harness.dispose();
		}
	});
});
