/** @jest-environment node */
import { Query } from 'mingo';

import { normalizeCheckpoint, type StoredOrderDocument, withOrderColumns } from '@wcpos/sync-core';

import { orderBrowserQueryKey } from '../../../sync-engine/src/scheduler/order-browser-scheduler-descriptor';
import {
	createOrdersSchedulerFetcher,
	type OrdersSchedulerCoverageRepository,
} from '../../../sync-engine/src/scheduler/rx-scheduler-order-fetcher';
import { compileQuery } from '../../src/query-state/query-state-translator';

import type { QueryStateOf } from '../../src/query-state/query-state-types';

const FROM = Date.parse('2026-07-01T00:00:00Z') / 1_000;
const TO = Date.parse('2026-07-14T00:00:00Z') / 1_000;
const DAY = 24 * 60 * 60;
const gmt = (seconds: number) => new Date(seconds * 1_000).toISOString().slice(0, 19);
const uuidFor = (id: number) => `5b8e1a3c-2f4d-4a6b-9c8e-${String(id).padStart(12, '0')}`;
const order = (id: number, created: number, paid: number) => ({
	id,
	status: 'completed',
	date_created_gmt: gmt(created),
	date_modified_gmt: gmt(paid),
	date_paid_gmt: gmt(paid),
	meta_data: [{ key: '_woocommerce_pos_uuid', value: uuidFor(id) }],
});

const A = order(1, FROM - 30 * DAY, FROM + DAY);
const B = order(2, FROM + 2 * DAY, TO + DAY);
const C = order(3, FROM + 3 * DAY, FROM + 4 * DAY);

async function downloadSales(orders: ReturnType<typeof order>[]) {
	const state: QueryStateOf<'orders'> = {
		search: '',
		filters: {
			status: 'completed',
			dateRange: { from: gmt(FROM), to: gmt(TO) },
		},
		limit: Number.MAX_SAFE_INTEGER,
		sort: { field: 'date_created_gmt', direction: 'desc' },
	};
	const { demand, read } = compileQuery('orders', state, { id: 'sales', storeScope: 'sales' });
	const item = demand.find((entry) => entry.kind === 'orders-browse');
	if (!item || item.kind !== 'orders-browse') throw new Error('Missing orders-browse demand');
	const queryKey = orderBrowserQueryKey(item);
	const stored = new Map<string, StoredOrderDocument>();
	let lane: Awaited<
		ReturnType<NonNullable<OrdersSchedulerCoverageRepository['readLocalLaneCoverage']>>
	> = null;
	const coverageRepository: OrdersSchedulerCoverageRepository = {
		recordQueryResult: async () => undefined,
		readLocalLaneCoverage: async () => lane,
		publishRangedResume: async ({ resume }) => {
			lane = lane
				? { ...lane, rangedResume: resume }
				: { complete: false, fresh: true, expectedRecordIds: [], rangedResume: resume };
		},
		recordCumulativeQueryResult: async (input) => {
			const carried = input.resetCumulativeExpectedIds ? [] : (lane?.expectedRecordIds ?? []);
			lane = {
				complete: input.complete,
				fresh: true,
				expectedRecordIds: [...new Set([...carried, ...input.records.map((record) => record.id)])],
				...(input.rangedResume ? { rangedResume: input.rangedResume } : {}),
			};
		},
	};
	const schedulerFetcher = createOrdersSchedulerFetcher({
		baseUrl: 'http://wcpos.local/wp-json/wcpos/v2',
		repository: {
			upsertMany: async (documents) => {
				for (const document of documents) {
					// The real EngineOrderRepository promotes these columns at its storage boundary.
					stored.set(document.uuid, withOrderColumns(document));
				}
			},
		},
		coverageRepository,
		checkpointStore: {
			readCustomPullCheckpoint: async () => normalizeCheckpoint(null),
			writeCustomPullCheckpoint: async () => undefined,
		},
		fetcher: async (url) => {
			const params = new URL(url).searchParams;
			expect(params.get('dates_are_gmt')).toBe('true');
			expect(params.get('orderby')).toBe('date');
			expect(params.get('order')).toBe('desc');
			const after = params.get('after');
			const before = params.get('before');
			const modifiedAfter = params.get('modified_after');
			const status = params.get('status');
			const excluded = new Set(
				(params.get('exclude') ?? '').split(',').filter(Boolean).map(Number)
			);
			const perPage = Number(params.get('per_page'));
			const page = Number(params.get('page'));
			const matching = orders
				.filter((entry) => {
					const created = Date.parse(`${entry.date_created_gmt}Z`);
					const modified = Date.parse(`${entry.date_modified_gmt}Z`);
					return (
						(!status || status === 'any' || status.split(',').includes(entry.status)) &&
						(!after || created > Date.parse(after)) &&
						(!before || created < Date.parse(before)) &&
						(!modifiedAfter || modified > Date.parse(modifiedAfter)) &&
						!excluded.has(entry.id)
					);
				})
				.sort(
					(left, right) =>
						Date.parse(`${right.date_created_gmt}Z`) - Date.parse(`${left.date_created_gmt}Z`) ||
						right.id - left.id
				);
			return new Response(JSON.stringify(matching.slice((page - 1) * perPage, page * perPage)), {
				status: 200,
				headers: {
					'content-type': 'application/json',
					'X-WP-Total': String(matching.length),
					'X-WP-TotalPages': String(Math.max(1, Math.ceil(matching.length / perPage))),
				},
			});
		},
	});
	for (let pass = 0; pass < 10; pass += 1) {
		const result = await schedulerFetcher({
			id: queryKey,
			requirementId: item.id,
			collection: 'orders',
			queryKey,
			limit: 25,
			priority: 700,
			mode: 'greedy',
		});
		if (result.completed) {
			expect(lane).toMatchObject({ complete: true });
			const documents = [...stored.values()];
			return {
				documents,
				counted: documents.filter(
					(doc) => new Query(read.prefilter).test(doc) && read.residual(doc)
				),
			};
		}
	}
	throw new Error('Sales lane did not complete within 10 passes');
}

it('counts earlier-created orders paid in the Reports window from an empty database', async () => {
	const { documents, counted } = await downloadSales([A, B, C]);

	expect(documents.map((doc) => doc.uuid)).toContain(uuidFor(A.id));
	expect(counted.map((doc) => doc.uuid).sort()).toEqual([uuidFor(A.id), uuidFor(C.id)]);
	expect(counted).toHaveLength(2);
});

it('stores an order created in the Reports window but excludes it when paid after the window', async () => {
	const { documents, counted } = await downloadSales([B]);

	expect(documents.map((doc) => doc.uuid)).toEqual([uuidFor(B.id)]);
	expect(counted).toHaveLength(0);
});
