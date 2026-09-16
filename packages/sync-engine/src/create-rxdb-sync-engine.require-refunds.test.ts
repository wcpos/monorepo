import { afterEach, describe, expect, it, vi } from 'vitest';

import { mintRemoteId } from '@wcpos/sync-core';

import { createEngineHarness } from './testing';

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
async function harness() {
	const { setPremiumFlag } = await import('rxdb-premium/plugins/shared');
	setPremiumFlag();
	const requests: URL[] = [];
	let pages = 1;
	let fail = false;
	const h = await createEngineHarness({
		site: 'https://refunds.example.test',
		identity: {
			site: 'https://refunds.example.test',
			storeId: 3,
			cashierId: `refunds-${++sequence}`,
		},
		fetch: async (url) => {
			const parsed = new URL(url);
			if (!parsed.pathname.endsWith('/refunds')) return new Response('[]');
			requests.push(parsed);
			if (fail) return new Response('failure', { status: 500 });
			const page = Number(parsed.searchParams.get('page'));
			const rows =
				pages === 0
					? []
					: pages === 1
						? [row(1)]
						: Array.from({ length: 100 }, (_, i) => row((page - 1) * 100 + i + 1));
			return new Response(JSON.stringify(rows), { headers: { 'X-WP-TotalPages': String(pages) } });
		},
	});
	return {
		...h,
		requests,
		setPages: (value: number) => {
			pages = value;
		},
		setFail: () => {
			fail = true;
		},
	};
}

describe('refund requirements', () => {
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
		h.setPages(101);
		const handle = h.engine.require({
			id: 'long-history',
			kind: 'refresh',
			collection: 'refunds',
			forceRefresh: true,
		});
		await expect(handle.ready).resolves.toMatchObject({
			action: 'fetched',
			requests: 101,
			documents: 10100,
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
