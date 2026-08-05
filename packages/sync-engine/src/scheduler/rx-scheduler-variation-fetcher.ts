import { variationDocumentId } from '@wcpos/sync-core';

import { parseVariationsEnvelope, variationDocument } from '../collections/collection-descriptors';
import { manifestRowOf } from '../materialization/record-materialization';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import {
	type CollectionSchedulerInput,
	httpGet,
	recordCoverage,
} from './rx-scheduler-collection-fetcher';
// prettier-ignore
import { type FetchTask, type FetchTaskResult, pullRequestLimit, type SchedulerFetcher, type SchedulerFetcherContext } from './replication-policy';

import type { StoredVariationDocument } from '../collections/variation-schema';
import type { ExistenceManifestDocument } from '../local-coverage/existence-manifest-schema';

/** Keep equal to FLEXSEARCH_MIN_TERM_LENGTH in packages/query/src/engine-query.ts. */
const FLEXSEARCH_MIN_TERM_LENGTH = 3;

export type VariationsSchedulerFetcherInput = CollectionSchedulerInput<StoredVariationDocument> & {
	manifestSink?: (rows: ExistenceManifestDocument[]) => Promise<void>;
};

function variationSearchTerm(task: FetchTask): string | null {
	const match = /^variations:search:(.+)$/.exec(task.queryKey);
	if (!match) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch (error) {
		if (error instanceof URIError) return match[1];
		throw error;
	}
}

function assertVariationSearchTask(task: FetchTask): string {
	if (task.collection !== 'variations')
		throw new Error(`Variations scheduler fetcher cannot run ${task.collection} tasks`);
	if (task.ids && task.ids.length > 0)
		throw new Error('Variation scheduler task does not support targeted ids');
	const search = variationSearchTerm(task);
	if (search === null) {
		throw new Error(`Variation scheduler task queryKey is not supported: ${task.queryKey}`);
	}
	if (!Number.isSafeInteger(task.limit) || task.limit <= 0) {
		throw new Error('Variation scheduler task limit must be a positive integer');
	}
	return search;
}

function taskLimit(task: FetchTask, pullBatchSize?: () => number | undefined): number {
	return Math.min(pullRequestLimit(task, pullBatchSize), WOO_REST_MAX_PER_PAGE);
}

async function fetchVariationSearchLeg(
	input: VariationsSchedulerFetcherInput,
	name: 'search' | 'sku',
	term: string,
	limit: number,
	perPage: number,
	context?: SchedulerFetcherContext
): Promise<{
	payloads: Record<string, unknown>[];
	requestCount: number;
	exhausted: boolean;
}> {
	const payloads: Record<string, unknown>[] = [];
	let requestCount = 0;
	let exhausted = false;
	const pageSize = Math.min(perPage, limit);
	while (payloads.length < limit) {
		const query = new URLSearchParams({
			[name]: term,
			per_page: String(pageSize),
			page: String(requestCount + 1),
		});
		const response = await httpGet(
			input,
			`${input.baseUrl}/variations?${query.toString()}`,
			context
		);
		if (!response.ok) {
			throw new Error(`Woo REST variation search request failed: ${response.status}`);
		}
		const pagePayloads = parseVariationsEnvelope(JSON.parse(await response.text()));
		requestCount += 1;
		payloads.push(...pagePayloads);
		if (pagePayloads.length < pageSize) {
			exhausted = true;
			break;
		}
	}
	return { payloads: payloads.slice(0, limit), requestCount, exhausted };
}

function uniqueVariationPayloads(payloads: Record<string, unknown>[]): Record<string, unknown>[] {
	const byId = new Map<number, Record<string, unknown>>();
	for (const payload of payloads) {
		const id = Number(payload.id);
		if (!byId.has(id)) byId.set(id, payload);
	}
	return [...byId.values()];
}

export function createVariationsSchedulerFetcher(
	input: VariationsSchedulerFetcherInput
): SchedulerFetcher {
	return async (task: FetchTask, context?: SchedulerFetcherContext): Promise<FetchTaskResult> => {
		const search = assertVariationSearchTask(task).trim();
		const limit = task.limit;
		const pageSize = taskLimit(task, input.pullBatchSize);
		const searchLeg =
			search.length < FLEXSEARCH_MIN_TERM_LENGTH
				? null
				: await fetchVariationSearchLeg(input, 'search', search, limit, pageSize, context);
		const skuLeg = await fetchVariationSearchLeg(input, 'sku', search, limit, pageSize, context);
		const payloads = uniqueVariationPayloads([...skuLeg.payloads, ...(searchLeg?.payloads ?? [])]);
		const documents = payloads
			.slice(0, limit)
			.map((payload) => variationDocument(payload) as StoredVariationDocument);
		await input.repository.upsertMany(documents);
		const manifestRows = documents.flatMap((document) =>
			manifestRowOf(document) ? [manifestRowOf(document)!] : []
		);
		if (input.manifestSink && manifestRows.length > 0) {
			await input.manifestSink(manifestRows);
		}
		const complete = (searchLeg?.exhausted ?? true) && skuLeg.exhausted && payloads.length <= limit;
		await recordCoverage(
			'variations',
			input,
			task,
			// Coverage stays in the stable Woo-id space (`woo-variation:<wooId>`), not the uuid
			// storage key — same contract as the products fetcher's coverageRecordId.
			documents.map((document) =>
				document.wooId === null ? document.id : variationDocumentId(document.wooId)
			),
			complete
		);

		return {
			taskId: task.id,
			documentCount: documents.length,
			requestCount: (searchLeg?.requestCount ?? 0) + skuLeg.requestCount,
			completed: complete,
		};
	};
}
