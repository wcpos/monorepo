import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import type { WooOrderPayload } from '@wcpos/sync-core';

import { createEngineHarness, remoteId } from './testing';
import { materializeLocalOnly } from './materialization/record-materialization';
import { EngineOrderRepository } from './write-path/engine-order-repository';
import { createRequirePlane } from './require-plane';

setPremiumFlag();

const NOW = Date.parse('2026-11-20T12:00:00Z');
const UUID = '77777777-7777-4777-8777-777777777777';
const view = { id: 'orders-view', kind: 'orders-browse', collection: 'orders', limit: 50 } as const;
const metaData = [
	{ key: '_woocommerce_pos_uuid', value: UUID },
	{ key: '_pos_user', value: '7' },
	{ key: '_pos_store', value: '3' },
];
const order = (overrides: Partial<WooOrderPayload> = {}): WooOrderPayload => ({
	id: 7,
	status: 'completed',
	total: '10.00',
	date_created_gmt: '2025-01-01T00:00:00',
	date_modified_gmt: '2026-11-20T11:00:00',
	_rxdb_revision: 'sha256:a',
	meta_data: metaData,
	...overrides,
});

describe('open order view maintenance', () => {
	it('a reassigned-away order leaves the cashier view after the include= pass', async () => {
		const includes: URL[] = [];
		const harness = await createEngineHarness({
			mode: 'manual',
			startAtMs: NOW,
			fetch: async (url) => {
				const parsed = new URL(url);
				if (!parsed.searchParams.has('include')) return Response.json([]);
				includes.push(parsed);
				return Response.json([
					order({
						_rxdb_revision: 'sha256:b',
						date_modified_gmt: '2026-11-20T12:00:00',
						meta_data: metaData.map((meta) =>
							meta.key === '_pos_user' ? { ...meta, value: '999' } : meta
						),
					}),
				]);
			},
		});
		try {
			const scope = await harness.engine.whenActive();
			await new EngineOrderRepository(scope.database as never).upsertMany([
				materializeLocalOnly(order()).storedDocument,
			]);
			const handle = harness.engine.require({ ...view, cashierId: 7, store: '3' });
			await handle.ready;
			expect((await harness.collection('orders').findOne(UUID).exec())!.get('posUserId')).toBe('7');
			await harness.engine.sync('order-window-seed');
			await harness.engine.sync('scheduler-drain');
			expect((await harness.collection('orders').findOne(UUID).exec())!.get('posUserId')).toBe(
				'999'
			);
			expect(
				await harness
					.collection('orders')
					.find({ selector: { posUserId: '7' } })
					.exec()
			).toHaveLength(0);
			expect(includes).toHaveLength(1);
			expect(includes[0].searchParams.get('include')).toBe('7');
			handle.release();
		} finally {
			await harness.dispose();
		}
	});
});

describe('live order browse keys', () => {
	function plane() {
		const manager = { activeScope: null as string | null, onEvent: () => () => undefined };
		return {
			manager,
			plane: createRequirePlane({
				manager: manager as never,
				admitted: () => new Promise(() => undefined),
				databaseFor: () => null,
				coverageFor: () => null,
				fetcher: async () => Response.json([]),
				syncBaseUrl: 'https://example.test',
				diagnostics: vi.fn(),
			}),
		};
	}

	it('returns without adopting or dropping pending keys when no scope is active', async () => {
		const context = plane();
		const handle = context.plane.require(view);
		await expect(context.plane.refreshLiveOrderBrowseWindows()).resolves.toBeUndefined();
		context.manager.activeScope = 'a';
		expect(context.plane.liveOrderBrowseQueryKeys()).toEqual([handle.queryKey]);
		handle.release();
	});

	it('keeps a key until both handles release and ignores a double release', () => {
		const context = plane();
		context.manager.activeScope = 'a';
		const first = context.plane.require(view);
		const second = context.plane.require(view);
		expect(context.plane.liveOrderBrowseQueryKeys()).toEqual([first.queryKey]);
		first.release();
		first.release();
		expect(context.plane.liveOrderBrowseQueryKeys()).toEqual([second.queryKey]);
		second.release();
		expect(context.plane.liveOrderBrowseQueryKeys()).toEqual([]);
	});

	it('adopts pre-ready declarations only into the first scope that reads them', () => {
		const context = plane();
		const first = context.plane.require(view);
		context.manager.activeScope = 'a';
		const second = context.plane.require(view);
		expect(context.plane.liveOrderBrowseQueryKeys()).toEqual([first.queryKey]);
		context.manager.activeScope = 'b';
		expect(context.plane.liveOrderBrowseQueryKeys()).toEqual([]);
		first.release();
		context.manager.activeScope = 'a';
		expect(context.plane.liveOrderBrowseQueryKeys()).toEqual([second.queryKey]);
		second.release();
		expect(context.plane.liveOrderBrowseQueryKeys()).toEqual([]);
	});
});

describe('manual order view refresh', () => {
	it('manual sync re-walks a fresh cashier window', async () => {
		const nextUuid = '88888888-8888-4888-8888-888888888888';
		let includeNewOrder = false;
		let walks = 0;
		const harness = await createEngineHarness({
			mode: 'manual',
			startAtMs: NOW,
			fetch: async (url) => {
				const params = new URL(url).searchParams;
				if (
					params.has('include') ||
					params.get('pos_cashier') !== '7' ||
					params.get('status') !== 'completed'
				)
					return Response.json([]);
				walks += 1;
				return Response.json([
					order(),
					...(includeNewOrder
						? [
								order({
									id: 8,
									meta_data: metaData.map((meta) =>
										meta.key === '_woocommerce_pos_uuid' ? { ...meta, value: nextUuid } : meta
									),
								}),
							]
						: []),
				]);
			},
		});
		try {
			const handle = harness.engine.require({
				...view,
				cashierId: 7,
				store: '3',
				status: 'completed',
			});
			await handle.ready;
			const before = walks;
			expect(before).toBeGreaterThan(0);
			includeNewOrder = true;
			expect(await harness.collection('orders').findOne(nextUuid).exec()).toBeNull();
			await harness.engine.sync();
			expect.soft(walks).toBeGreaterThan(before);
			expect(await harness.collection('orders').findOne(nextUuid).exec()).not.toBeNull();
			handle.release();
		} finally {
			await harness.dispose();
		}
	});

	it('does not walk an orders window when no view is live', async () => {
		const harness = await createEngineHarness({
			mode: 'manual',
			fetch: async () => Response.json([]),
		});
		try {
			await harness.engine.sync();
			expect(
				harness.requests.filter(({ url }) => new URL(url).searchParams.has('pos_cashier'))
			).toHaveLength(0);
		} finally {
			await harness.dispose();
		}
	});

	it('does not re-walk a complete ranged orders window', async () => {
		const harness = await createEngineHarness({
			mode: 'manual',
			fetch: async () => Response.json([]),
		});
		try {
			const handle = harness.engine.require({
				...view,
				limit: 'all',
				afterSeconds: Date.parse('2026-11-19T00:00:00Z') / 1000,
				beforeSeconds: NOW / 1000,
			});
			await handle.ready;
			const requests = harness.requests.filter(({ url }) => new URL(url).searchParams.has('after'));
			expect(requests.length).toBeGreaterThan(0);
			const after = new URL(requests[0].url).searchParams.get('after');
			const before = harness.requests.length;
			await harness.engine.sync();
			expect(
				harness.requests
					.slice(before)
					.filter(({ url }) => new URL(url).searchParams.get('after') === after)
			).toHaveLength(0);
			handle.release();
		} finally {
			await harness.dispose();
		}
	});

	it('a rendered-row read lands status, line-item and cashier changes at the same modified time', async () => {
		const includes: URL[] = [];
		const harness = await createEngineHarness({
			mode: 'manual',
			fetch: async (url) => {
				const parsed = new URL(url);
				if (parsed.searchParams.get('include') !== '7') return Response.json([]);
				includes.push(parsed);
				return Response.json([
					order({
						status: 'on-hold',
						_rxdb_revision: 'sha256:b',
						line_items: [{ id: 1, product_id: 10, quantity: 3 }],
						meta_data: metaData.map((meta) =>
							meta.key === '_pos_user' ? { ...meta, value: '999' } : meta
						),
					}),
				]);
			},
		});
		try {
			const scope = await harness.engine.whenActive();
			await new EngineOrderRepository(scope.database as never).upsertMany([
				materializeLocalOnly(order({ line_items: [{ id: 1, product_id: 10, quantity: 1 }] }))
					.storedDocument,
			]);
			const handle = harness.engine.require({
				id: 'orders:rendered-refresh',
				collection: 'orders',
				kind: 'targeted-records',
				remoteIds: [remoteId(7)],
				forceRefresh: true,
			});
			await handle.ready;
			const row = (await harness.collection('orders').findOne(UUID).exec())!;
			expect(row.get('payload.status')).toBe('on-hold');
			expect(row.get('payload.line_items')).toEqual([{ id: 1, product_id: 10, quantity: 3 }]);
			expect(row.get('posUserId')).toBe('999');
			expect(includes).toHaveLength(1);
			expect(includes[0].searchParams.get('include')).toBe('7');
			for (const param of ['status', 'pos_cashier', 'modified_after']) {
				expect(includes[0].searchParams.has(param)).toBe(false);
			}
			handle.release();
		} finally {
			await harness.dispose();
		}
	});
});
