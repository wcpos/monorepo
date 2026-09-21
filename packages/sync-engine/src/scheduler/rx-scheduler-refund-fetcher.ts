import { hasPosRefundStamp, HISTORY_DAYS } from '@wcpos/sync-core';

import { materializeRefund } from '../materialization/record-materialization';
import { parseRefundLaneQueryKey } from './refund-lane-descriptor';
import {
	type CollectionSchedulerInput,
	httpGet,
	recordCoverage,
} from './rx-scheduler-collection-fetcher';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';

import type { LocalRefundDocument, WooRefundPayload } from '../collections/refund-schema';
import type { SchedulerFetcher } from './replication-policy';

export type RefundSchedulerFetcherInput = CollectionSchedulerInput<LocalRefundDocument> & {
	scope?: { storeId?: string | number };
	repository: CollectionSchedulerInput<LocalRefundDocument>['repository'] & {
		removeMany(documents: LocalRefundDocument[]): Promise<void>;
	};
	heldParentIds(ids: number[]): Promise<Map<number, number[] | null>>;
};

/** One page per invocation preserves the runner's progress reporting and lease renewal. */
export function createRefundsSchedulerFetcher(
	input: RefundSchedulerFetcherInput
): SchedulerFetcher {
	const walks = new Map<string, { page: number; perPage: number; after: string; ids: string[] }>();
	return async (task, context) => {
		const lane = parseRefundLaneQueryKey(task.queryKey);
		if (
			task.collection !== 'refunds' ||
			!lane ||
			task.mode !== 'greedy' ||
			task.documentIds?.length ||
			!Number.isSafeInteger(task.limit) ||
			task.limit <= 0
		) {
			throw new Error(`Unsupported refund scheduler task: ${task.queryKey}`);
		}
		const walk = walks.get(task.id) ?? {
			page: 1,
			perPage: Math.min(task.limit, WOO_REST_MAX_PER_PAGE),
			ids: [],
			after: new Date((input.nowMs?.() ?? Date.now()) - HISTORY_DAYS * 86400000).toISOString(),
		};
		const query = new URLSearchParams({
			...(lane.kind === 'history' ? { after: walk.after } : { parent: lane.parentRemoteId }),
			dates_are_gmt: '1',
			orderby: 'id',
			order: 'asc',
			per_page: String(walk.perPage),
			page: String(walk.page),
		});
		const response = await httpGet(input, `${input.baseUrl}/refunds?${query}`, context);
		if (!response.ok) throw new Error(`Woo REST refunds request failed: ${response.status}`);
		const rows = (await response.json()) as WooRefundPayload[];
		const held = await input.heldParentIds([...new Set(rows.map((row) => row.parent_id))]);
		const documents = rows
			.filter((row) => {
				const listed = held.get(row.parent_id);
				if (listed !== undefined) return listed === null || listed.includes(row.id);
				return hasPosRefundStamp(row.meta_data, input.scope);
			})
			.map((raw) => materializeRefund(raw).storedDocument);
		let applied = (await input.repository.upsertMany(documents)) ?? documents;
		if (applied.length > 0) {
			const current = await input.heldParentIds([
				...new Set(applied.map((doc) => doc.payload.parent_id)),
			]);
			const removed = applied.filter(({ payload }) => {
				const listed = current.get(payload.parent_id);
				if (listed !== undefined) return Array.isArray(listed) && !listed.includes(payload.id);
				return !hasPosRefundStamp(payload.meta_data, input.scope);
			});
			if (removed.length > 0) {
				await input.repository.removeMany(removed);
				const removedIds = new Set(removed.map(({ uuid }) => uuid));
				applied = applied.filter(({ uuid }) => !removedIds.has(uuid));
			}
		}
		const pageIds = applied.map((document) => document.uuid);
		walk.ids.push(...pageIds);
		// WooCommerce always sends the page count; a short page is the end only when it does not.
		const totalPages = Number(response.headers.get('X-WP-TotalPages'));
		const completed = totalPages > 0 ? walk.page >= totalPages : rows.length < walk.perPage;
		await recordCoverage(
			'refunds',
			input,
			task,
			pageIds,
			completed,
			undefined,
			completed ? walk.ids : undefined
		);
		if (completed) walks.delete(task.id);
		else {
			walk.page += 1;
			walks.set(task.id, walk);
		}
		return { taskId: task.id, documentCount: applied.length, requestCount: 1, completed };
	};
}
