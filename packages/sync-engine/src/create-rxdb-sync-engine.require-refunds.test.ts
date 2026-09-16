import { afterEach, describe, expect, it, vi } from 'vitest';

import { mintRemoteId } from '@wcpos/sync-core';

import { createEngineHarness } from './testing';
import { materializeLocalOnly } from './materialization/record-materialization';
import { EngineOrderRepository } from './write-path/engine-order-repository';

import type { LocalRefundDocument } from './collections/refund-schema';

let sequence = 0;
afterEach(async () => {
	await createEngineHarness.disposeTrackedEngines();
	vi.restoreAllMocks();
});
const row = (id: number) => ({
	id,
	parent_id: 42,
	date_created_gmt: '2026-09-01T00:00:00',
	amount: '20.0000',
	reason: '',
	meta_data: [{ key: '_wcpos_session', value: 'B' }],
});
async function harness(respond?: (url: URL) => Response) {
	const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
	setPremiumFlag();
	const requests: URL[] = [];
	let pages = 1;
	let rowsPerPage = 100;
	let fail = false;
	const h = await createEngineHarness({
		site: 'https://refunds.example.test',
		identity: {
			site: 'https://refunds.example.test',
			storeId: 3,
			cashierId: `refunds-${++sequence}`,
		},
		startAtMs: Date.parse('2026-09-16T00:00:00Z'),
		fetch: async (url) => {
			const parsed = new URL(url);
			if (!parsed.pathname.endsWith('/refunds')) return new Response('[]');
			requests.push(parsed);
			if (respond) return respond(parsed);
			if (fail) return new Response('failure', { status: 500 });
			const page = Number(parsed.searchParams.get('page'));
			const rows =
				pages === 0
					? []
					: pages === 1
						? [row(1)]
						: Array.from({ length: rowsPerPage }, (_, i) => row((page - 1) * rowsPerPage + i + 1));
			return new Response(JSON.stringify(rows), { headers: { 'X-WP-TotalPages': String(pages) } });
		},
	});
	return {
		...h,
		requests,
		setPages: (value: number, perPage = 100) => {
			pages = value;
			rowsPerPage = perPage;
		},
		setFail: () => {
			fail = true;
		},
	};
}

const parent = (id: number, refunds: { id: number }[] = []) =>
	materializeLocalOnly({
		id,
		status: 'completed',
		refunds,
		meta_data: [
			{
				key: '_woocommerce_pos_uuid',
				value: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
			},
		],
	}).storedDocument;

async function refresh(h: Awaited<ReturnType<typeof harness>>, parentId?: number) {
	const handle = h.engine.require({
		id: `integration:${h.requests.length}`,
		collection: 'refunds',
		forceRefresh: true,
		...(parentId === undefined
			? { kind: 'refresh' as const }
			: {
					kind: 'refunds-by-parent' as const,
					parentRemoteId: mintRemoteId(parentId, 'test'),
				}),
	});
	try {
		return await handle.ready;
	} finally {
		handle.release();
	}
}

async function readRefunds(h: Awaited<ReturnType<typeof harness>>, parentId?: number) {
	return (
		await h
			.collection<LocalRefundDocument>('refunds')
			.find({
				selector: parentId === undefined ? {} : { 'payload.parent_id': parentId },
				sort: [{ 'payload.date_created_gmt': 'desc' }],
			})
			.exec()
	).map((doc) => doc.toJSON());
}

describe('refund requirements', () => {
	// Stop on admitted documents.length rather than raw rows.length: page two is lost.
	it('queries admitted payloads after a full rejected page without server UUIDs', async () => {
		const h = await harness((url) =>
			Response.json(
				url.searchParams.get('page') === '1'
					? Array.from({ length: 100 }, (_, i) => ({ ...row(i + 1), parent_id: 99, meta_data: [] }))
					: [
							{ ...row(101), meta_data: [], _rxdb_revision: 'stamped-revision' },
							{ ...row(102), parent_id: 99 },
							{
								...row(103),
								parent_id: 99,
								meta_data: [{ key: '_wcpos_register', value: 'register' }],
							},
							{ ...row(104), parent_id: 99, meta_data: [] },
						],
				{ headers: { 'X-WP-TotalPages': '2' } }
			)
		);
		const scope = await h.engine.whenActive();
		await new EngineOrderRepository(scope.database.collections as never).upsertMany([parent(42)]);
		await expect(refresh(h)).resolves.toMatchObject({ documents: 3, requests: 2 });
		expect(h.requests.map((url) => url.searchParams.get('page'))).toEqual(['1', '2']);
		expect((await readRefunds(h)).map((doc) => doc.payload.id).sort()).toEqual([101, 102, 103]);
		expect(await readRefunds(h, 42)).toEqual([
			expect.objectContaining({
				uuid: 'woo-refund:101',
				remoteId: '101',
				payload: expect.objectContaining({ id: 101, parent_id: 42 }),
				sync: expect.objectContaining({ revision: 'stamped-revision' }),
			}),
		]);
	});

	// Freeze the history cutoff or replace upsert-only ingestion with replacement: old rows disappear.
	it('moves the history window without evicting older by-parent residents', async () => {
		const h = await harness((url) =>
			Response.json(
				url.searchParams.has('parent')
					? [{ ...row(1), date_created_gmt: '2025-01-01T00:00:00', meta_data: [] }]
					: url.searchParams.get('after') === '2026-06-16T00:00:00.000Z'
						? [row(2)]
						: []
			)
		);
		const scope = await h.engine.whenActive();
		await new EngineOrderRepository(scope.database.collections as never).upsertMany([parent(42)]);
		await refresh(h, 42);
		await refresh(h);
		expect((await readRefunds(h, 42)).map((doc) => doc.payload.id)).toEqual([2, 1]);
		h.clock.advance(100 * 86400000);
		await expect(refresh(h)).resolves.toMatchObject({ documents: 0 });
		expect(h.requests.at(-1)?.searchParams.get('after')).toBe('2026-09-24T00:00:00.000Z');
		expect((await readRefunds(h, 42)).map((doc) => doc.payload.id)).toEqual([2, 1]);
	});

	// Remove repository reconciliation/reset cascading: the queried children survive their parent.
	it('uses parent summaries, not an empty successful pull, as deletion authority and resets/refills', async () => {
		let empty = false;
		const h = await harness(() =>
			Response.json(empty ? [] : [row(1), row(2), { ...row(3), parent_id: 43 }])
		);
		const scope = await h.engine.whenActive();
		const repo = new EngineOrderRepository(scope.database.collections as never);
		await repo.upsertMany([parent(42)]);
		await refresh(h);
		empty = true;
		await expect(refresh(h, 42)).resolves.toMatchObject({ documents: 0, requests: 1 });
		expect(await readRefunds(h, 42)).toHaveLength(2);
		await repo.upsertMany([parent(42, [{ id: 2 }])]);
		expect((await readRefunds(h, 42)).map((doc) => doc.payload.id)).toEqual([2]);
		await repo.upsertMany([parent(42, [])]);
		expect(await readRefunds(h, 42)).toEqual([]);
		expect((await readRefunds(h)).map((doc) => doc.payload.id)).toEqual([3]);
		await h.engine.scope.resetCollection('refunds');
		expect(await readRefunds(h)).toEqual([]);
		empty = false;
		await refresh(h);
		expect(await readRefunds(h)).toHaveLength(3);
		await h.engine.scope.resetCollection('orders');
		expect((await readRefunds(h)).map((doc) => doc.payload.id)).toEqual([3]);
	});

	// Return completed:true on a full first page, or replace residents: interruption is hidden/data lost.
	it('preserves residents and accepted pages when a later page interrupts the walk', async () => {
		const h = await harness((url) => {
			if (url.searchParams.has('parent')) return Response.json([row(1000)]);
			if (url.searchParams.get('page') === '2') return new Response('interrupted', { status: 500 });
			return Response.json(
				Array.from({ length: 100 }, (_, i) => row(i + 1)),
				{
					headers: { 'X-WP-TotalPages': '2' },
				}
			);
		});
		await refresh(h, 42);
		await expect(refresh(h)).rejects.toThrow(/scheduler drain failed/i);
		const ids = (await readRefunds(h, 42)).map((doc) => doc.payload.id);
		expect(ids).toHaveLength(101);
		expect(ids).toEqual(expect.arrayContaining([1, 100, 1000]));
		expect(h.diagnostics).toContainEqual(
			expect.objectContaining({
				message: expect.stringContaining('refunds.walk-stopped'),
				level: 'warn',
				collection: 'refunds',
			})
		);
	});
	it('history refresh stores deterministic rows and forced refresh bypasses completed dedupe', async () => {
		const h = await harness();
		const handle = h.engine.require({
			id: 'history',
			kind: 'refresh',
			collection: 'refunds',
			forceRefresh: true,
		});
		expect(handle.queryKey).toBe('refunds:history:days=92');
		await expect(handle.ready).resolves.toMatchObject({ action: 'fetched', documents: 1 });
		expect((await h.collection('refunds').find().exec()).map((doc) => doc.toJSON())).toEqual([
			expect.objectContaining({ uuid: 'woo-refund:1', remoteId: '1' }),
		]);
		handle.release();
		const before = h.requests.length;
		const again = h.engine.require({
			id: 'history-again',
			kind: 'refresh',
			collection: 'refunds',
			forceRefresh: true,
		});
		await expect(again.ready).resolves.toMatchObject({ action: 'fetched' });
		expect(h.requests.length).toBe(before + 1);
		expect(h.requests.at(-1)?.searchParams.has('after')).toBe(true);
		again.release();
	});
	it('an empty parent walk completes and re-opening force-refreshes it', async () => {
		const h = await harness();
		h.setPages(0);
		for (let i = 0; i < 2; i += 1) {
			const handle = h.engine.require({
				id: `parent-${i}`,
				kind: 'refunds-by-parent',
				collection: 'refunds',
				parentRemoteId: mintRemoteId(42, 'test'),
				forceRefresh: true,
			});
			expect(handle.queryKey).toBe('refunds:parent:42');
			await expect(handle.ready).resolves.toMatchObject({
				action: 'fetched',
				documents: 0,
				requests: 1,
			});
			handle.release();
		}
		expect(h.requests.filter((u) => u.searchParams.get('parent') === '42')).toHaveLength(2);
		expect(h.requests.at(-1)?.searchParams.has('after')).toBe(false);
	});
	it('walks beyond the ordinary 100-call drain cap', async () => {
		const h = await harness();
		// One row per page: the walk is proven by request count, not by ten thousand documents.
		h.setPages(101, 1);
		const handle = h.engine.require({
			id: 'long-history',
			kind: 'refresh',
			collection: 'refunds',
			forceRefresh: true,
		});
		await expect(handle.ready).resolves.toMatchObject({
			action: 'fetched',
			requests: 101,
			documents: 101,
		});
		expect(h.requests.at(-1)?.searchParams.get('page')).toBe('101');
		handle.release();
	}, 30000);
	it('rejects failed walks and emits a warning instead of reporting completion', async () => {
		const h = await harness();
		h.setFail();
		const handle = h.engine.require({
			id: 'failed-parent',
			kind: 'refunds-by-parent',
			collection: 'refunds',
			parentRemoteId: mintRemoteId(42, 'test'),
			forceRefresh: true,
		});
		await expect(handle.ready).rejects.toThrow(/scheduler drain failed/i);
		expect(h.diagnostics).toContainEqual(
			expect.objectContaining({
				type: 'engine.guard',
				message: expect.stringContaining('refunds.walk-stopped'),
				level: 'warn',
				collection: 'refunds',
			})
		);
		handle.release();
	});
});
