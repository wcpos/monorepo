import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import type { WooOrderPayload } from '@wcpos/sync-core';

import { createEngineHarness } from './testing';
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
