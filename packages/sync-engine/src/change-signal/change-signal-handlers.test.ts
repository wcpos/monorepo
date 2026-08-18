import { describe, expect, it, vi } from 'vitest';

import {
	COLLECTION_DESCRIPTORS,
	type TargetedDescriptor,
} from '../collections/collection-descriptors';
import {
	buildReplicationHandlers,
	type HandlerContext,
	pullTargetedByIds,
} from './change-signal-handlers';

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
	removedPrimaries: string[] = [],
	removedManifestIds: string[] = []
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
				existenceManifest: {
					bulkRemove: async (ids: string[]) => {
						removedManifestIds.push(...ids);
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

describe('change-signal tombstone manifest membership', () => {
	it('removes a resident product and its manifest row', async () => {
		const removedDocs: string[] = [];
		const removedManifestIds: string[] = [];
		const ctx = context(
			'products',
			[],
			[],
			[{ primary: 'uuid-7', json: { remoteId: '7' } }],
			removedDocs,
			removedManifestIds
		);

		await buildReplicationHandlers(ctx).deleteProducts([7]);

		expect(removedDocs).toEqual(['uuid-7']);
		expect(removedManifestIds).toEqual(['7']);
	});

	it('keeps both the resident product and manifest row when local work is pending', async () => {
		const removedDocs: string[] = [];
		const removedManifestIds: string[] = [];
		const ctx = context(
			'products',
			[],
			[],
			[{ primary: 'uuid-7', json: { remoteId: '7', local: { dirty: true } } }],
			removedDocs,
			removedManifestIds
		);

		await buildReplicationHandlers(ctx).deleteProducts([7]);

		expect(removedDocs).toEqual([]);
		expect(removedManifestIds).toEqual([]);
	});

	it('removes a stale manifest row for a product that was never held locally', async () => {
		const removedManifestIds: string[] = [];
		const ctx = context('products', [], [], [], [], removedManifestIds);

		await buildReplicationHandlers(ctx).deleteProducts([7]);

		expect(removedManifestIds).toEqual(['7']);
	});
});

describe('pullTargetedByIds product publication filter', () => {
	it('sends status=publish and accepts a short products response', async () => {
		const urls: string[] = [];

		await expect(
			pullTargetedByIds(context('products', [], urls), descriptor('products'), [1, 2])
		).resolves.toBe(2);
		expect(new URL(urls[0]!).searchParams.get('status')).toBe('publish');
	});

	it('tombstones clean resident products omitted by a publish-filtered pull', async () => {
		const urls: string[] = [];
		const removed: string[] = [];
		const residents: ResidentRow[] = [
			{ primary: 'uuid-clean', json: { wooProductId: 1 } },
			{ primary: 'uuid-dirty', json: { wooProductId: 2, local: { dirty: true } } },
		];

		await expect(
			pullTargetedByIds(
				context('products', [], urls, residents, removed),
				descriptor('products'),
				[1, 2]
			)
		).resolves.toBe(2);
		// The dirty row keeps the local-work protection every removal path honours.
		expect(removed).toEqual(['uuid-clean']);
	});

	it.each([
		['variations', { documents: [] }],
		['customers', []],
	] as const)('prunes a short %s pull without sending status', async (collection, body) => {
		const urls: string[] = [];
		const observe = vi.fn();
		const ctx = context(collection, body, urls);
		ctx.observe = observe;

		await expect(pullTargetedByIds(ctx, descriptor(collection), [1])).resolves.toBe(1);
		expect(new URL(urls[0]!).searchParams.has('status')).toBe(false);
		expect(observe).toHaveBeenCalledWith({
			type: 'targeted.pull.shortfall-prune',
			level: 'warn',
			collection,
			fields: { requested: 1, received: 0, missing: 1 },
		});
	});

	it('keeps a resident variation when transport fails before parsing', async () => {
		const removed: string[] = [];
		const ctx = context(
			'variations',
			{ documents: [] },
			[],
			[{ primary: 'uuid-resident', json: { wooId: 1 } }],
			removed
		);
		ctx.fetch = vi.fn(async () => new Response(null, { status: 503 })) as never;

		await expect(pullTargetedByIds(ctx, descriptor('variations'), [1])).rejects.toThrow(/HTTP 503/);
		expect(removed).toEqual([]);
	});
});
