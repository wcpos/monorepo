import { scopeDatabaseName } from '@wcpos/sync-core';

import { recordScopeOpened, type ScopeHistoryDatabase } from './legacy-scope-history';

const A = { site: 'https://a.example.test', storeId: 1, cashierId: 2 };
const B = { site: 'https://b.example.test', storeId: 3, cashierId: 4 };
const v5 = (scope: typeof A) => scopeDatabaseName(scope, { generation: 5 });

/** A user database fake: local documents in a map, and a storage token written at `tokenAtMs`. */
function userDatabase(tokenAtMs: number | null) {
	const locals = new Map<string, Record<string, unknown>>();
	const db: ScopeHistoryDatabase = {
		getLocal: async (id) => {
			const data = locals.get(id);
			return data ? { get: (key: string) => data[key] } : null;
		},
		upsertLocal: async (id, data) => void locals.set(id, { ...data }),
		internalStore: {
			findDocumentsById: async () => (tokenAtMs === null ? [] : [{ _meta: { lwt: tokenAtMs } }]),
		},
	};
	return { db, locals };
}

describe('the scope history', () => {
	it('is complete when the app database was created in this run (a fresh install)', async () => {
		const { db } = userDatabase(Date.now() + 1_000);
		const history = await recordScopeOpened(db, A);
		expect(history).toMatchObject({ names: [v5(A)], complete: true, settled: false });
	});

	it('is incomplete when the app database predates this run, and stays so', async () => {
		const { db } = userDatabase(Date.UTC(2026, 0, 1));
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
		const { db, locals } = userDatabase(Date.now() + 1_000);
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
		const { db } = userDatabase(Date.now() + 1_000);
		const first = await recordScopeOpened(db, A);
		await first.markCleared([v5(A)]);
		expect(await recordScopeOpened(db, A)).toMatchObject({ settled: true });
		const reopened = await recordScopeOpened(db, C);
		expect(reopened).toMatchObject({ settled: false, cleared: [v5(A)] });
		await reopened.markCleared([v5(C)]);
		expect(await recordScopeOpened(db, C)).toMatchObject({ settled: true });
	});

	it('an incomplete history is never settled, however much is cleared', async () => {
		const { db } = userDatabase(Date.UTC(2026, 0, 1));
		const history = await recordScopeOpened(db, A);
		await history.markCleared([v5(A)]);
		expect(await recordScopeOpened(db, A)).toMatchObject({ settled: false });
	});
});
