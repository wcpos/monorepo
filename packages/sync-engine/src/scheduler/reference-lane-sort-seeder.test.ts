import { describe, expect, it } from 'vitest';

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
});
