import { scopeDatabaseName } from '@wcpos/sync-core';

import { recordScopeOpened, type ScopeHistoryDatabase } from './legacy-scope-history';

const A = { site: 'https://a.example.test', storeId: 1, cashierId: 2 };
const B = { site: 'https://b.example.test', storeId: 3, cashierId: 4 };
const v5 = (scope: typeof A) => scopeDatabaseName(scope, { generation: 5 });

/**
 * A user database fake: local documents in a map, and its storage token — created by THIS database
 * instance, by an `other` (an earlier run), absent, or carrying only a write time.
 */
function userDatabase(storageToken: 'this' | 'other' | null | { lwt: number }) {
	const locals = new Map<string, Record<string, unknown>>();
	let writes: Promise<void> = Promise.resolve();
	const db: ScopeHistoryDatabase = {
		// Like rxdb's local documents: reads see the latest data, and a modifier runs against the
		// LATEST data when its write lands (after a turn, as rxdb's write queue does).
		getLocal: async (id) =>
			locals.has(id)
				? {
						get: (key: string) => locals.get(id)![key],
						incrementalModify: (modify) => {
							// rxdb's write queue: one modifier at a time, each against the latest data.
							writes = writes.then(async () => {
								const latest = { ...locals.get(id) } as Parameters<typeof modify>[0];
								locals.set(id, { ...(await modify(latest)) });
							});
							return writes;
						},
					}
				: null,
		insertLocal: async (id, data) => {
			await Promise.resolve();
			if (locals.has(id)) throw new Error('conflict: the document exists');
			locals.set(id, { ...data });
		},
		token: 'this-instance',
		internalStore: {
			findDocumentsById: async () =>
				storageToken === null
					? []
					: typeof storageToken === 'object'
						? [{ _meta: { lwt: storageToken.lwt } }]
						: [
								{
									_meta: { lwt: Date.now() },
									data: {
										instanceToken: storageToken === 'this' ? 'this-instance' : 'earlier-instance',
									},
								},
							],
		},
	};
	return { db, locals };
}

describe('the scope history', () => {
	it('is complete when the app database was created in this run (a fresh install)', async () => {
		const { db } = userDatabase('this');
		const history = await recordScopeOpened(db, A);
		expect(history).toMatchObject({ names: [v5(A)], complete: true, settled: false });
	});

	it('is incomplete when the app database predates this run, and stays so', async () => {
		const { db } = userDatabase('other');
		expect(await recordScopeOpened(db, A)).toMatchObject({ complete: false });
		// Later scopes join it; completeness was decided once, at the first record.
		expect(await recordScopeOpened(db, B)).toMatchObject({
			names: [v5(A), v5(B)],
			complete: false,
		});
	});

	it('reads a missing storage token as late (the safe side)', async () => {
		const { db } = userDatabase(null);
		expect(await recordScopeOpened(db, A)).toMatchObject({ complete: false });
	});

	it('keeps every scope it ever opened, and is settled once every name is cleared', async () => {
		const { db, locals } = userDatabase('this');
		await recordScopeOpened(db, A);
		const history = await recordScopeOpened(db, B);
		expect(history.settled).toBe(false);
		await recordScopeOpened(db, A);
		await history.markCleared([v5(A), v5(B)]);
		expect(locals.get('legacy-scope-history')).toEqual({
			names: [v5(A), v5(B)],
			complete: true,
			cleared: [v5(A), v5(B)],
		});
		expect(await recordScopeOpened(db, A)).toMatchObject({ settled: true });
	});

	it('a settled history that opens a new scope is unsettled until that name is cleared', async () => {
		const C = { site: 'https://c.example.test', storeId: 5, cashierId: 6 };
		const { db } = userDatabase('this');
		const first = await recordScopeOpened(db, A);
		await first.markCleared([v5(A)]);
		expect(await recordScopeOpened(db, A)).toMatchObject({ settled: true });
		const reopened = await recordScopeOpened(db, C);
		expect(reopened).toMatchObject({ settled: false, cleared: [v5(A)] });
		await reopened.markCleared([v5(C)]);
		expect(await recordScopeOpened(db, C)).toMatchObject({ settled: true });
	});

	it('an incomplete history is never settled, however much is cleared', async () => {
		const { db } = userDatabase('other');
		const history = await recordScopeOpened(db, A);
		await history.markCleared([v5(A)]);
		expect(await recordScopeOpened(db, A)).toMatchObject({ settled: false });
	});

	it('two scopes opened at once both join the history', async () => {
		const { db, locals } = userDatabase('this');
		await Promise.all([recordScopeOpened(db, A), recordScopeOpened(db, B)]);
		expect([...((locals.get('legacy-scope-history')?.names as string[]) ?? [])].sort()).toEqual(
			[v5(A), v5(B)].sort()
		);
	});

	it('a clear landing beside a newly opened scope keeps both', async () => {
		const C = { site: 'https://c.example.test', storeId: 5, cashierId: 6 };
		const { db, locals } = userDatabase('this');
		const history = await recordScopeOpened(db, A);
		await Promise.all([history.markCleared([v5(A)]), recordScopeOpened(db, C)]);
		expect(locals.get('legacy-scope-history')).toMatchObject({
			names: [v5(A), v5(C)],
			cleared: [v5(A)],
		});
	});

	it('is complete only when the storage token was created by THIS database instance', async () => {
		expect(await recordScopeOpened(userDatabase('this').db, A)).toMatchObject({ complete: true });
		expect(await recordScopeOpened(userDatabase('other').db, A)).toMatchObject({ complete: false });
	});

	it('without an instance id, a token written in the future (a clock moved back) is inconclusive: incomplete', async () => {
		const future = Date.now() + 6 * 60_000;
		expect(await recordScopeOpened(userDatabase({ lwt: future }).db, A)).toMatchObject({
			complete: false,
		});
		// …while one written in this run is complete (the time fallback).
		expect(await recordScopeOpened(userDatabase({ lwt: Date.now() }).db, A)).toMatchObject({
			complete: true,
		});
	});
});
