import { enqueueOrderMutation, resetOrderMutationQueues } from './order-mutation-queue';

const saved = { uuid: 'born' } as never;
beforeEach(resetOrderMutationQueues);

it('serialises slots for one order and hands later slots the saved record an earlier one left, even after the queue drained', async () => {
	const seen: unknown[] = [];
	await enqueueOrderMutation('born', async (queue) => {
		seen.push(queue.order);
		queue.order = saved;
	});
	// The queue for 'born' has drained: a fresh slot still finds the saved record.
	await enqueueOrderMutation('born', async (queue) => {
		seen.push(queue.order);
	});
	expect(seen).toEqual([undefined, saved]);
});

it('keeps one order’s saved record away from another order’s slots', async () => {
	let other: unknown = 'unset';
	await enqueueOrderMutation('other', async (queue) => {
		other = queue.order;
	});
	expect(other).toBeUndefined();
});

it('a slot that throws still leaves its saved record for the next', async () => {
	await expect(
		enqueueOrderMutation('thrower', async (queue) => {
			queue.order = saved;
			throw new Error('writer failed');
		})
	).rejects.toThrow('writer failed');
	let next: unknown;
	await enqueueOrderMutation('thrower', async (queue) => {
		next = queue.order;
	});
	expect(next).toBe(saved);
});
