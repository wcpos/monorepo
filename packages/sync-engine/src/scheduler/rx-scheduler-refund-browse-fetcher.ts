import { parseRefundBrowserSchedulerDescriptor } from './refund-browser-scheduler-descriptor';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import { pageBoundary, RANGED_RESUME_MAX_EXCLUDED_IDS } from './rx-scheduler-order-fetcher';
import { admitRefundPage, type RefundSchedulerFetcherInput } from './rx-scheduler-refund-fetcher';
import { DEFAULT_COVERAGE_FRESH_FOR_MS, httpGet } from './rx-scheduler-collection-fetcher';
import { pullRequestLimit, type SchedulerFetcher } from './replication-policy';

import type { WooRefundPayload } from '../collections/refund-schema';

export function createRefundBrowseSchedulerFetcher(
	input: RefundSchedulerFetcherInput
): SchedulerFetcher {
	let refreshed = false;
	return async (task, context) => {
		const descriptor = parseRefundBrowserSchedulerDescriptor(task.queryKey);
		const coverage = input.coverageRepository;
		if (
			!descriptor ||
			task.collection !== 'refunds' ||
			task.documentIds?.length ||
			task.mode !== (descriptor.complete ? 'greedy' : 'windowed') ||
			!coverage?.recordCumulativeQueryResult ||
			!coverage.readLocalLaneCoverage
		) {
			throw new Error(`Unsupported refund browse task: ${task.queryKey}`);
		}
		const now = () => input.nowMs?.() ?? Date.now();
		const readLane = () => coverage.readLocalLaneCoverage!('refunds', task.queryKey, now());
		const lane = await readLane();
		const restart =
			!descriptor.complete || (!refreshed && input.refreshBrowseWindowKey === task.queryKey);
		refreshed ||= input.refreshBrowseWindowKey === task.queryKey;
		let expected = lane?.rangedResume ?? null;
		let resume = restart ? null : expected;
		// Woo bounds are exclusive; widen the inclusive window, not the continuation cursor.
		let before = Math.min(
			descriptor.beforeSeconds + 1,
			resume?.beforeSeconds ?? descriptor.beforeSeconds + 1
		);
		let exclude = resume?.excludeWooIds ?? [];
		let downloaded =
			resume?.downloadedRecords ?? (resume ? (lane?.expectedRecordIds?.length ?? 0) : 0);
		let total = resume?.totalRecords ?? null;
		let consumed = 0,
			documentCount = 0,
			requestCount = 0,
			completed = false;
		while (consumed < descriptor.limit) {
			const perPage = Math.min(
				pullRequestLimit(task, input.pullBatchSize),
				WOO_REST_MAX_PER_PAGE,
				descriptor.limit - consumed
			);
			const query = new URLSearchParams({
				after: new Date((descriptor.afterSeconds - 1) * 1000).toISOString(),
				before: new Date(before * 1000).toISOString(),
				dates_are_gmt: 'true',
				orderby: 'date',
				order: 'desc',
				per_page: String(perPage),
				page: '1',
				...(exclude.length ? { exclude: exclude.join(',') } : {}),
			});
			const response = await httpGet(input, `${input.baseUrl}/refunds?${query}`, context);
			if (!response.ok) throw new Error(`Woo REST refunds request failed: ${response.status}`);
			const rows = (await response.json()) as WooRefundPayload[];
			const kept = rows.slice(0, perPage);
			const totalHeader = response.headers.get('X-WP-Total');
			if (
				requestCount === 0 &&
				totalHeader !== null &&
				Number.isSafeInteger(Number(totalHeader)) &&
				Number(totalHeader) >= 0
			)
				total = downloaded + Number(totalHeader);
			if (kept.length) {
				const boundary = pageBoundary(kept);
				if (!boundary) throw new Error(`Refund browse cannot advance: ${task.queryKey}`);
				const nextBefore = Math.min(before, boundary.seconds + 1);
				exclude =
					nextBefore < before ? boundary.wooIds : [...new Set([...exclude, ...boundary.wooIds])];
				before = nextBefore;
				if (exclude.length > RANGED_RESUME_MAX_EXCLUDED_IDS)
					throw new Error(`Refund browse boundary exceeds ${RANGED_RESUME_MAX_EXCLUDED_IDS} IDs`);
			}
			const applied = await admitRefundPage(input, kept);
			consumed += kept.length;
			downloaded += kept.length;
			documentCount += applied.length;
			requestCount += 1;
			const pages = response.headers.get('X-WP-TotalPages');
			completed =
				rows.length <= perPage &&
				(rows.length < perPage ||
					(pages !== null && Number.isSafeInteger(Number(pages)) && Number(pages) <= 1));
			resume =
				completed || !descriptor.complete
					? null
					: {
							beforeSeconds: before,
							excludeWooIds: exclude,
							totalRecords: total,
							downloadedRecords: downloaded,
						};
			await coverage.recordCumulativeQueryResult({
				collection: 'refunds',
				queryKey: task.queryKey,
				records: applied.map(({ uuid }) => ({ id: uuid })),
				complete: completed,
				nowMs: now(),
				freshForMs: input.coverageFreshForMs ?? DEFAULT_COVERAGE_FRESH_FOR_MS,
				resetCumulativeExpectedIds: requestCount === 1 && (restart || expected === null),
				rangedResume: resume,
				rangedResumeExpected: expected,
			});
			// A concurrent lane reset demotes the write. Do not finish or advance from rejected ancestry.
			const recorded = await readLane();
			if (completed ? !recorded?.complete : descriptor.complete && !recorded?.rangedResume) {
				return { taskId: task.id, documentCount, requestCount, completed: false };
			}
			expected = resume;
			if (completed) break;
		}
		return { taskId: task.id, documentCount, requestCount, completed };
	};
}
