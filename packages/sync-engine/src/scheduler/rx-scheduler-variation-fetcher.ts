import { variationDocumentId } from '@wcpos/sync-core';

import {
	parseVariationsEnvelope,
	variationMaterialized,
} from '../collections/collection-descriptors';
import { manifestRowsForApplied } from '../local-coverage/existence-manifest-population';
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

export type VariationsSchedulerFetcherInput = CollectionSchedulerInput<StoredVariationDocument> & {
	manifestSink?: (rows: ExistenceManifestDocument[]) => Promise<void>;
	exactSkuLeg?: () => boolean;
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
	if (task.documentIds && task.documentIds.length > 0)
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
		const exactSkuLeg = search.length > 0 && (input.exactSkuLeg?.() ?? true);
		const skuLeg = !exactSkuLeg
			? { payloads: [], requestCount: 0, exhausted: true }
			: await fetchVariationSearchLeg(input, 'sku', search, limit, pageSize, context);
		const searchLeg = !search.length
			? { payloads: [], requestCount: 0, exhausted: true }
			: await fetchVariationSearchLeg(input, 'search', search, limit, pageSize, context);
		const payloads = uniqueVariationPayloads([...skuLeg.payloads, ...searchLeg.payloads]);
		// The manifest row travels on the envelope, not on the stored document — see
		// MaterializedProjection. Upsert the documents first, then feed the sink their rows.
		const materialized = payloads
			.slice(0, limit)
			.map((payload) => variationMaterialized(payload, input.barcodeSelectors?.()));
		const documents = materialized.map(
			({ storedDocument }) => storedDocument as StoredVariationDocument
		);
		const applied = (await input.repository.upsertMany(documents)) ?? documents;
		const manifestRows = manifestRowsForApplied(materialized, applied);
		if (input.manifestSink && manifestRows.length > 0) {
			await input.manifestSink(manifestRows);
		}
		const complete = searchLeg.exhausted && skuLeg.exhausted && payloads.length <= limit;
		await recordCoverage(
			'variations',
			input,
			task,
			// Coverage stays in the stable Woo-id space (`woo-variation:<wooId>`), not the uuid
			// storage key — same contract as the products fetcher's coverageRecordId.
			documents.map((document) =>
				document.remoteId === null ? document.uuid : variationDocumentId(document.remoteId)
			),
			complete
		);

		return {
			taskId: task.id,
			documentCount: documents.length,
			requestCount: skuLeg.requestCount + searchLeg.requestCount,
			completed: complete,
		};
	};
}
