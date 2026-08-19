import { describe, expect, it } from 'vitest';

import { schedulerTaskStateKey } from './scheduler-task-state-schema';
import { referenceLaneTaskFor, seedReferenceLanes } from './rx-pos-bootstrap-seeder';

function schedulerDatabase() {
	const stored = new Map<string, Record<string, unknown>>();
	const document = (stateKey: string) => ({
		toJSON: () => ({ ...stored.get(stateKey) }),
		incrementalModify: async (
			mutate: (current: Record<string, unknown>) => Record<string, unknown>
		) => {
			const next = mutate({ ...stored.get(stateKey) });
			if (next._deleted) stored.delete(stateKey);
			else stored.set(stateKey, next);
		},
	});
	return {
		stored,
		database: {
			schedulerTaskStates: {
				insert: async (value: Record<string, unknown>) => {
					stored.set(String(value.stateKey), value);
				},
				bulkUpsert: async () => [],
				find: () => ({ exec: async () => [...stored.keys()].map(document) }),
				findOne: (stateKey: string) => ({
					exec: async () => (stored.has(stateKey) ? document(stateKey) : null),
				}),
			},
		} as never,
	};
}

function categoryKeys(stored: Map<string, Record<string, unknown>>): string[] {
	return [...stored.values()]
		.filter((row) => row.collectionName === 'categories')
		.map((row) => String(row.queryKey));
}

async function categoryTaskKeys(): Promise<string[][]> {
	const { database, stored } = schedulerDatabase();
	await seedReferenceLanes({
		database,
		collections: ['categories'],
		sorts: { categories: { orderby: 'name', order: 'desc' } },
	});
	await seedReferenceLanes({ database, collections: ['categories'] });
	const afterSortlessReseed = categoryKeys(stored);
	await seedReferenceLanes({
		database,
		collections: ['categories'],
		sorts: { categories: { orderby: 'slug', order: 'asc' } },
	});
	return [afterSortlessReseed, categoryKeys(stored)];
}

describe('reference lane sorted seeding', () => {
	it('puts the sort in the query key and task id', () => {
		const task = referenceLaneTaskFor('categories', { orderby: 'name', order: 'desc' });
		expect(task).toMatchObject({
			queryKey: 'categories:all:orderby=name:order=desc',
			id: 'categories:all:orderby=name:order=desc:greedy',
		});
	});

	it('preserves a sortless reseed and supersedes it when an explicit sort changes', async () => {
		await expect(categoryTaskKeys()).resolves.toEqual([
			['categories:all:orderby=name:order=desc'],
			['categories:all:orderby=slug:order=asc'],
		]);
	});

	it('reconciles the formerly canonical explicit name-asc term lane', async () => {
		const { database, stored } = schedulerDatabase();
		await seedReferenceLanes({
			database,
			collections: ['categories'],
			sorts: { categories: { orderby: 'name', order: 'desc' } },
		});
		const persisted = [...stored.entries()].find(
			([, row]) => row.queryKey === 'categories:all:orderby=name:order=desc'
		);
		if (persisted === undefined) throw new Error('expected a persisted sorted lane');

		const [stateKey, state] = persisted;
		const legacyTaskId = 'categories:all:orderby=name:order=asc:greedy';
		const legacyStateKey = schedulerTaskStateKey(legacyTaskId);
		stored.delete(stateKey);
		stored.set(legacyStateKey, {
			...state,
			stateKey: legacyStateKey,
			taskId: legacyTaskId,
			queryKey: 'categories:all:orderby=name:order=asc',
		});

		await seedReferenceLanes({ database, collections: ['categories'] });

		expect(categoryKeys(stored)).toEqual(['categories:all']);
	});

	it('a supersede that loses its CAS re-reads and retries instead of rejecting', async () => {
		const { database, stored } = schedulerDatabase();
		await seedReferenceLanes({
			database,
			collections: ['categories'],
			sorts: { categories: { orderby: 'name', order: 'desc' } },
		});
		const oldStateKey = [...stored.entries()].find(
			([, row]) => row.queryKey === 'categories:all:orderby=name:order=desc'
		)?.[0];
		if (oldStateKey === undefined) throw new Error('expected a persisted sorted lane');

		// A concurrent owner mutates the row between the seeder's read and its
		// CAS-guarded remove: hand the FIRST findOne for the old lane a tampered
		// snapshot so that remove legitimately loses, then behave normally so the
		// re-read retry can win.
		const collectionStub = (
			database as unknown as {
				schedulerTaskStates: { findOne: (stateKey: string) => { exec: () => Promise<unknown> } };
			}
		).schedulerTaskStates;
		const originalFindOne = collectionStub.findOne.bind(collectionStub);
		let tampered = false;
		collectionStub.findOne = (stateKey: string) => {
			if (!tampered && stateKey === oldStateKey) {
				tampered = true;
				return {
					exec: async () => ({
						toJSON: () => ({ ...stored.get(stateKey), priority: 1 }),
						incrementalModify: async () => undefined,
					}),
				};
			}
			return originalFindOne(stateKey);
		};

		await seedReferenceLanes({
			database,
			collections: ['categories'],
			sorts: { categories: { orderby: 'slug', order: 'asc' } },
		});
		expect(tampered).toBe(true);
		expect(categoryKeys(stored)).toEqual(['categories:all:orderby=slug:order=asc']);
	});

	it('a supersede an active drain keeps winning never rejects; later reseeds converge it', async () => {
		const { database, stored } = schedulerDatabase();
		await seedReferenceLanes({
			database,
			collections: ['categories'],
			sorts: { categories: { orderby: 'name', order: 'desc' } },
		});
		const oldStateKey = [...stored.entries()].find(
			([, row]) => row.queryKey === 'categories:all:orderby=name:order=desc'
		)?.[0];
		if (oldStateKey === undefined) throw new Error('expected a persisted sorted lane');

		// A drain renewing its lease per page wins EVERY removal attempt.
		const collectionStub = (
			database as unknown as {
				schedulerTaskStates: { findOne: (stateKey: string) => { exec: () => Promise<unknown> } };
			}
		).schedulerTaskStates;
		const originalFindOne = collectionStub.findOne.bind(collectionStub);
		let drainHoldsLease = true;
		collectionStub.findOne = (stateKey: string) => {
			if (drainHoldsLease && stateKey === oldStateKey) {
				return {
					exec: async () => ({
						toJSON: () => ({ ...stored.get(stateKey), priority: 1 }),
						incrementalModify: async () => undefined,
					}),
				};
			}
			return originalFindOne(stateKey);
		};

		// The refresh must still seed the requested sort (no rejection); the stale
		// row survives this round.
		await seedReferenceLanes({
			database,
			collections: ['categories'],
			sorts: { categories: { orderby: 'slug', order: 'asc' } },
		});
		expect(categoryKeys(stored).sort()).toEqual([
			'categories:all:orderby=name:order=desc',
			'categories:all:orderby=slug:order=asc',
		]);

		// Once the drain lets go, the next reseed converges back to one lane.
		drainHoldsLease = false;
		await seedReferenceLanes({
			database,
			collections: ['categories'],
			sorts: { categories: { orderby: 'slug', order: 'asc' } },
		});
		expect(categoryKeys(stored)).toEqual(['categories:all:orderby=slug:order=asc']);
	});
});
