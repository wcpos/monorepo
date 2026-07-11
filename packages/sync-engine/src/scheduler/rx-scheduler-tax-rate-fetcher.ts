/**
 * Tax-rate scheduler fetcher — the G1 exception (ADR 0009): tax rates stay keyed by woo-tax-rate:<id> with NO
 * uuid identity, so storage id == coverage id (single id-space) and there is no deletion prune. A thin spec over
 * the shared greedy core (createGreedyCollectionFetcher).
 */

import {
	type LocalTaxRateDocument,
	taxRateDocumentId,
	type WooTaxRatePayload,
} from '../collections/tax-rate-schema';
import {
	type CollectionSchedulerCoverageRepository,
	type CollectionSchedulerInput,
	createGreedyCollectionFetcher,
} from './rx-scheduler-collection-fetcher';
import { materializeUpsertRefresh } from '../materialization/record-materialization';

import type { SchedulerFetcher } from './replication-scheduler';

export type TaxRateSchedulerCoverageRepository = CollectionSchedulerCoverageRepository;
export type TaxRateSchedulerFetcherInput = CollectionSchedulerInput<LocalTaxRateDocument>;

function taxRateDocumentFromWooPayload(payload: WooTaxRatePayload): LocalTaxRateDocument {
	return materializeUpsertRefresh(payload).storedDocument;
}

export function createTaxRateSchedulerFetcher(
	input: TaxRateSchedulerFetcherInput
): SchedulerFetcher {
	return createGreedyCollectionFetcher<LocalTaxRateDocument, WooTaxRatePayload>(
		{
			collection: 'taxRates',
			greedyQueryKey: 'taxRates:all',
			endpoint: 'taxes',
			documentFromPayload: taxRateDocumentFromWooPayload,
			// G1: id IS woo-tax-rate:<id> — storage and coverage share the one id-space, no prune.
			storageId: (document) => document.id,
			coverageRecordId: (document) => document.id,
		},
		input
	);
}
