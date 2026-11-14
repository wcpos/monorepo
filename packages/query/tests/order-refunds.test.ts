import { acquireOrderRefundsQueryHandle } from '../src';
import { canonicalQueryKey } from '../src/query-state';
import { createEngineDatabase, createFakeEngine, queryHandleCount } from '../src/testing';

it('shares an order key and gives successor handles distinct demand ids from one sequence', async () => {
	const database = await createEngineDatabase(['refunds', 'orders']);
	const engine = createFakeEngine(database);
	const key = (orderId: number, generation = 0) =>
		canonicalQueryKey(['refunds-by-parent', generation, 0, orderId]);
	const releases: (() => void)[] = [];
	try {
		const first = acquireOrderRefundsQueryHandle(engine, key(37), 37);
		releases.push(first.retain());
		expect(acquireOrderRefundsQueryHandle(engine, key(37), 37)).toBe(first);
		expect(engine.requireCalls).toHaveLength(1);
		const other = acquireOrderRefundsQueryHandle(engine, key(38), 38);
		const successor = acquireOrderRefundsQueryHandle(engine, key(37, 1), 37);
		releases.push(other.retain(), successor.retain());
		expect(new Set([first, other, successor]).size).toBe(3);
		expect(engine.requireCalls.map(({ id }) => id)).toEqual([
			'refunds:order-detail:37:0:refunds-by-parent',
			'refunds:order-detail:38:1:refunds-by-parent',
			'refunds:order-detail:37:2:refunds-by-parent',
		]);
	} finally {
		for (const release of releases) release();
		await Promise.resolve();
		expect(queryHandleCount(engine)).toBe(0);
		await database.remove();
	}
});
