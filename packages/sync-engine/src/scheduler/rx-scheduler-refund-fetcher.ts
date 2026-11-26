import { hasPosRefundStamp, HISTORY_DAYS } from '@wcpos/sync-core';

import { createRefundBrowseSchedulerFetcher } from './rx-scheduler-refund-browse-fetcher';
import { materializeRefund } from '../materialization/record-materialization';
import { parseRefundLaneQueryKey } from './refund-lane-descriptor';
import {
	type CollectionSchedulerInput,
	httpGet,
	recordCoverage,
} from './rx-scheduler-collection-fetcher';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import { wooGmtDate } from './woo-gmt-date';

import type { LocalRefundDocument, WooRefundPayload } from '../collections/refund-schema';
import type { SchedulerFetcher } from './replication-policy';

/** engineKv key of the refund history walk checkpoint (#3340). Cleared by refunds and orders resets. */
export const REFUND_HISTORY_CHECKPOINT_KEY = 'refund-history:checkpoint';
/** Created-date overlap behind the last walk start: covers clock skew between till and server,
 * and re-fetches edits to refunds created in the last day (desk ruling, #3340). */
export const REFUND_HISTORY_DELTA_OVERLAP_MS = 24 * 3_600_000;
/** A full 92-day walk at most this long after the previous one: the bound within which an edit
 * to an older refund is seen (desk ruling, #3340). */
export const REFUND_HISTORY_FULL_WALK_EVERY_MS = 24 * 3_600_000;
export type RefundHistoryCheckpointStore = {
	get(): Promise<string | null>;
	set(value: string): Promise<void>;
	remove(): Promise<void>;
};
type RefundHistoryCheckpoint = { lastWalkStartedAtMs: number; lastFullWalkStartedAtMs: number };

/** Null means "walk full": an absent, unreadable or impossible blob (a clock that moved back). */
function decodeRefundHistoryCheckpoint(
	raw: string | null,
	nowMs: number
): RefundHistoryCheckpoint | null {
	if (raw === null) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	const { v, lastWalkStartedAtMs, lastFullWalkStartedAtMs } = (parsed ?? {}) as Record<
		string,
		unknown
	>;
	if (
		v !== 1 ||
		typeof lastWalkStartedAtMs !== 'number' ||
		typeof lastFullWalkStartedAtMs !== 'number' ||
		!Number.isFinite(lastWalkStartedAtMs) ||
		!Number.isFinite(lastFullWalkStartedAtMs) ||
		!(lastFullWalkStartedAtMs <= lastWalkStartedAtMs && lastWalkStartedAtMs <= nowMs)
	)
		return null;
	return { lastWalkStartedAtMs, lastFullWalkStartedAtMs };
}

function decodeWalk(raw: string | null, taskId: string, perPage: number, nowMs: number) {
	if (raw === null) return null;
	try {
		const { v, walk } = JSON.parse(raw);
		if (v !== 1 || walk?.taskId !== taskId || walk.perPage !== perPage) return null;
		const { page, after, ids, startedAtMs, lastFullWalkStartedAtMs }: Record<string, unknown> =
			walk;
		if (
			typeof page !== 'number' ||
			!Number.isSafeInteger(page) ||
			page < 1 ||
			typeof after !== 'string' ||
			!Array.isArray(ids) ||
			!ids.every((id) => typeof id === 'string') ||
			typeof startedAtMs !== 'number' ||
			!Number.isFinite(startedAtMs) ||
			typeof lastFullWalkStartedAtMs !== 'number' ||
			!Number.isFinite(lastFullWalkStartedAtMs) ||
			lastFullWalkStartedAtMs > startedAtMs ||
			startedAtMs > nowMs ||
			nowMs - startedAtMs >= REFUND_HISTORY_FULL_WALK_EVERY_MS
		)
			return null;
		return { page, perPage, after, ids, startedAtMs, lastFullWalkStartedAtMs };
	} catch {
		return null;
	}
}

export type RefundSchedulerFetcherInput = CollectionSchedulerInput<LocalRefundDocument> & {
	/** Persisted history walk checkpoint (#3340); absent means every history walk is full. */
	historyCheckpoint?: RefundHistoryCheckpointStore;
	coverageRepository?: CollectionSchedulerInput<LocalRefundDocument>['coverageRepository'] &
		Pick<
			import('./rx-scheduler-order-fetcher').OrdersSchedulerCoverageRepository,
			'recordCumulativeQueryResult' | 'readLocalLaneCoverage'
		>;
	refreshBrowseWindowKey?: string;
	scope?: { storeId?: string | number };
	repository: CollectionSchedulerInput<LocalRefundDocument>['repository'] & {
		removeMany(documents: LocalRefundDocument[]): Promise<void>;
	};
	heldParentIds(ids: number[]): Promise<Map<number, number[] | null>>;
};

// Reports browse passes anyStore (front desk ruling F3b, 2026-11-14: reports cover every store).
// Till lanes keep #2122's store veto: a store-scoped till never holds a parentless
// refund of another store.
export async function admitRefundPage(
	input: RefundSchedulerFetcherInput,
	rows: WooRefundPayload[],
	options: { anyStore?: boolean } = {}
) {
	const scope = options.anyStore ? undefined : input.scope;
	const held = await input.heldParentIds([...new Set(rows.map((row) => row.parent_id))]);
	const documents = rows
		.filter((row) => {
			const listed = held.get(row.parent_id);
			if (listed !== undefined) return listed === null || listed.includes(row.id);
			return hasPosRefundStamp(row.meta_data, scope);
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
			return !hasPosRefundStamp(payload.meta_data, scope);
		});
		if (removed.length > 0) {
			await input.repository.removeMany(removed);
			const removedIds = new Set(removed.map(({ uuid }) => uuid));
			applied = applied.filter(({ uuid }) => !removedIds.has(uuid));
		}
	}
	return applied;
}

/** One page per invocation preserves the runner's progress reporting and lease renewal. */
export function createRefundsSchedulerFetcher(
	input: RefundSchedulerFetcherInput
): SchedulerFetcher {
	const browse = createRefundBrowseSchedulerFetcher(input);
	const walks = new Map<
		string,
		{
			page: number;
			perPage: number;
			after: string;
			ids: string[];
			startedAtMs: number;
			failed: boolean;
			last: RefundHistoryCheckpoint | null;
			lastFullWalkStartedAtMs: number; // this walk's start when it is full
		}
	>();
	const checkpoint = input.historyCheckpoint;
	return async (task, context) => {
		if (task.queryKey.startsWith('refunds:browser:')) return browse(task, context);
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
		const historyCheckpoint = lane.kind === 'history' ? checkpoint : undefined;
		let walk = walks.get(task.id);
		if (!walk) {
			const startedAtMs = input.nowMs?.() ?? Date.now();
			const windowStartMs = startedAtMs - HISTORY_DAYS * 86400000;
			const raw = (await historyCheckpoint?.get()) ?? null;
			const last = decodeRefundHistoryCheckpoint(raw, startedAtMs);
			const perPage = Math.min(task.limit, WOO_REST_MAX_PER_PAGE);
			// Delta only while a full walk started less than a day ago; otherwise walk the window.
			const delta =
				last !== null &&
				startedAtMs - last.lastFullWalkStartedAtMs < REFUND_HISTORY_FULL_WALK_EVERY_MS
					? last
					: null;
			const afterMs = delta
				? Math.max(windowStartMs, delta.lastWalkStartedAtMs - REFUND_HISTORY_DELTA_OVERLAP_MS)
				: windowStartMs;
			walk = {
				page: 1,
				perPage,
				ids: [],
				after: wooGmtDate(Math.floor(afterMs / 1000)),
				startedAtMs,
				failed: false,
				lastFullWalkStartedAtMs: delta?.lastFullWalkStartedAtMs ?? startedAtMs,
				last,
				// Resume with one page of overlap so deletions cannot skip rows shifted back a page (#3782).
				...decodeWalk(raw, task.id, perPage, startedAtMs),
			};
		}
		const query = new URLSearchParams({
			...(lane.kind === 'history' ? { after: walk.after } : { parent: lane.parentRemoteId }),
			dates_are_gmt: '1',
			orderby: 'id',
			order: 'asc',
			per_page: String(walk.perPage),
			page: String(walk.page),
		});
		let applied: readonly LocalRefundDocument[];
		let completed: boolean;
		try {
			const response = await httpGet(input, `${input.baseUrl}/refunds?${query}`, context);
			if (!response.ok) throw new Error(`Woo REST refunds request failed: ${response.status}`);
			const rows = (await response.json()) as WooRefundPayload[];
			applied = await admitRefundPage(input, rows);
			const pageIds = applied.map((document) => document.uuid);
			const ids = [...new Set([...walk.ids, ...pageIds])];
			// WooCommerce always sends the page count; a short page is the end only when it does not.
			const totalPages = Number(response.headers.get('X-WP-TotalPages'));
			completed = totalPages > 0 ? walk.page >= totalPages : rows.length < walk.perPage;
			await recordCoverage(
				'refunds',
				input,
				task,
				pageIds,
				completed,
				undefined,
				completed ? ids : undefined
			);
			if (!completed && historyCheckpoint && !walk.failed) {
				const { after, perPage, page, startedAtMs, lastFullWalkStartedAtMs } = walk;
				await historyCheckpoint.set(
					JSON.stringify({
						v: 1,
						...walk.last,
						walk: {
							taskId: task.id,
							after,
							perPage,
							page,
							startedAtMs,
							lastFullWalkStartedAtMs,
							ids,
						},
					})
				);
			}
			walk.ids = ids;
		} catch (error) {
			if (context?.signal?.aborted) throw error;
			// A failed walk never writes the checkpoint, so the walk after it is full (#3340).
			if (historyCheckpoint) {
				walk.failed = true;
				walks.set(task.id, walk);
				await historyCheckpoint.remove();
			}
			throw error;
		}
		if (completed && historyCheckpoint && !walk.failed) {
			await historyCheckpoint.set(
				JSON.stringify({
					v: 1,
					lastWalkStartedAtMs: walk.startedAtMs,
					lastFullWalkStartedAtMs: walk.lastFullWalkStartedAtMs,
				})
			);
		}
		if (completed) walks.delete(task.id);
		else {
			walk.page += 1;
			walks.set(task.id, walk);
		}
		return { taskId: task.id, documentCount: applied.length, requestCount: 1, completed };
	};
}
