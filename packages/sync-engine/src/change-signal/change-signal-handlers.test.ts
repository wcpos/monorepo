import { describe, expect, it, vi } from 'vitest';

import {
	COLLECTION_DESCRIPTORS,
	type TargetedDescriptor,
} from '../collections/collection-descriptors';
import { type HandlerContext, pullTargetedByIds } from './change-signal-handlers';

function descriptor(collection: 'products' | 'variations' | 'customers'): TargetedDescriptor {
	const found = COLLECTION_DESCRIPTORS.find((item) => item.collection === collection);
	if (!found || found.shape !== 'targeted') throw new Error(`missing ${collection} descriptor`);
	return found;
}

type ResidentRow = { primary: string; json: Record<string, unknown> };

function context(
	collection: 'products' | 'variations' | 'customers',
	body: unknown,
	urls: string[],
	residents: ResidentRow[] = [],
	removedPrimaries: string[] = []
): HandlerContext {
	return {
		database: {
			collections: {
				[collection]: {
					find: () => ({
						exec: async () =>
							residents.map((row) => ({ primary: row.primary, toJSON: () => row.json })),
					}),
					bulkRemove: async (primaries: string[]) => {
						removedPrimaries.push(...primaries);
						return { error: [] };
					},
				},
			},
		} as never,
		fetch: vi.fn(async (url: string) => {
			urls.push(url);
			return Response.json(body);
		}) as never,
		syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
		persistState: async () => undefined,
		log: () => undefined,
	};
}

describe('pullTargetedByIds product publication filter', () => {
	it('sends status=publish and accepts a short products response', async () => {
		const urls: string[] = [];

		await expect(
			pullTargetedByIds(context('products', [], urls), descriptor('products'), [1, 2])
		).resolves.toBe(0);
		expect(new URL(urls[0]!).searchParams.get('status')).toBe('publish');
	});

	it('tombstones clean resident products omitted by a publish-filtered pull', async () => {
		const urls: string[] = [];
		const removed: string[] = [];
		const residents: ResidentRow[] = [
			{ primary: 'uuid-clean', json: { wooProductId: 1 } },
			{ primary: 'uuid-dirty', json: { wooProductId: 2, local: { dirty: true } } },
		];

		await pullTargetedByIds(
			context('products', [], urls, residents, removed),
			descriptor('products'),
			[1, 2]
		);
		// The dirty row keeps the local-work protection every removal path honours.
		expect(removed).toEqual(['uuid-clean']);
	});

	it.each([
		['variations', { documents: [] }],
		['customers', []],
	] as const)('does not send status for %s targeted pulls', async (collection, body) => {
		const urls: string[] = [];

		await expect(
			pullTargetedByIds(context(collection, body, urls), descriptor(collection), [1])
		).rejects.toThrow(/returned 0\/1 records/);
		expect(new URL(urls[0]!).searchParams.has('status')).toBe(false);
	});
});
