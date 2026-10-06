import { sqliteTransaction } from 'rxdb/plugins/storage-sqlite';

import type { SQLiteBasics, SQLiteDatabaseClass } from 'rxdb/plugins/storage-sqlite';

// Guards `patches/rxdb@17.5.0.patch` (sqlite-helpers): RxDB chains every transaction on one
// promise per database. Upstream, a handler that throws leaves a REJECTED link in that chain,
// so every later `.then` is skipped and every later write replays the same error until the
// process dies — the till could not save an order for the rest of a session (Pixel, 2026-10-06).
// The patch rolls back and keeps the chain alive; the caller still sees its own failure.
function fakeBasics() {
	const statements: string[] = [];
	const basics = {
		run: jest.fn(async (_db: unknown, q: { query: string }) => {
			statements.push(q.query);
		}),
	} as unknown as SQLiteBasics;
	return { basics, statements };
}

it('a failing transaction rolls back and the next transaction on the same database still runs', async () => {
	const database = {} as SQLiteDatabaseClass;
	const { basics, statements } = fakeBasics();
	const boom = new Error('UNIQUE constraint failed: products-0.id');

	await expect(
		sqliteTransaction(database, basics, async () => {
			throw boom;
		})
	).rejects.toBe(boom);
	expect(statements).toEqual(['BEGIN;', 'ROLLBACK;']);

	const second = jest.fn(async () => 'COMMIT' as const);
	await expect(sqliteTransaction(database, basics, second)).resolves.toBeUndefined();
	expect(second).toHaveBeenCalledTimes(1);
	expect(statements).toEqual(['BEGIN;', 'ROLLBACK;', 'BEGIN;', 'COMMIT;']);
});

it('a rollback that itself fails does not hide the handler’s error', async () => {
	const database = {} as SQLiteDatabaseClass;
	const { basics } = fakeBasics();
	const boom = new Error('step failed');
	(basics.run as jest.Mock).mockImplementation(async (_db: unknown, q: { query: string }) => {
		if (q.query === 'ROLLBACK;') throw new Error('cannot rollback');
	});
	await expect(
		sqliteTransaction(database, basics, async () => {
			throw boom;
		})
	).rejects.toBe(boom);
	await expect(
		sqliteTransaction(database, basics, async () => 'COMMIT' as const)
	).resolves.toBeUndefined();
});

it('transactions still run one at a time, in order', async () => {
	const database = {} as SQLiteDatabaseClass;
	const { basics, statements } = fakeBasics();
	const order: number[] = [];
	let releaseFirst: (() => void) | undefined;
	const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
	const first = sqliteTransaction(database, basics, async () => {
		await gate;
		order.push(1);
		return 'COMMIT' as const;
	});
	const second = sqliteTransaction(database, basics, async () => {
		order.push(2);
		return 'COMMIT' as const;
	});
	// Let the first transaction reach its handler (BEGIN is awaited first); the second must wait.
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(order).toEqual([]);
	expect(statements).toEqual(['BEGIN;']);
	releaseFirst!();
	await Promise.all([first, second]);
	expect(order).toEqual([1, 2]);
	expect(statements).toEqual(['BEGIN;', 'COMMIT;', 'BEGIN;', 'COMMIT;']);
});
