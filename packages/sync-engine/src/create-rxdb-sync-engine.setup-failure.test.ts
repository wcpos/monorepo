import { describe, expect, it, vi } from 'vitest';

import type { StoreScopeIdentity } from './create-rxdb-sync-engine';

const setupFailureState = vi.hoisted(() => ({
	closes: 0,
}));

vi.mock('rxdb', async (importOriginal) => {
	const actual = await importOriginal<typeof import('rxdb')>();

	return {
		...actual,
		createRxDatabase: vi.fn(async (...args: Parameters<typeof actual.createRxDatabase>) => {
			const db = await actual.createRxDatabase(...args);
			const close = db.close.bind(db);

			db.close = vi.fn(async () => {
				setupFailureState.closes += 1;
				return close();
			}) as typeof db.close;
			db.addCollections = vi.fn(async () => {
				throw new Error('collection setup failed');
			}) as typeof db.addCollections;

			return db;
		}),
	};
});

const { createRxdbSyncEngine } = await import('./create-rxdb-sync-engine');
const { memoryEngineStorage } = await import('./testing');

const SITE = 'https://lab.example.test';

function identityFor(cashierId: string): StoreScopeIdentity {
	return { site: SITE, storeId: 999, cashierId };
}

describe('createRxdbSyncEngine setup failure cleanup', () => {
	it('closes a database when collection setup fails after open', async () => {
		const engine = createRxdbSyncEngine(
			{
				site: { syncBaseUrl: `${SITE}/wp-json/wc-rxdb-sync/v1`, wpJsonRoot: `${SITE}/wp-json` },
				storage: memoryEngineStorage(),
			},
			identityFor('setup-failure')
		);

		await expect(engine.ready).rejects.toThrow(/collection setup failed/);

		expect(setupFailureState.closes).toBe(1);
		await engine.dispose();
	});
});
