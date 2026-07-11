/**
 * Generic GREEDY fetcher for small pull-only reference collections (product categories, product brands).
 * Parameterised by ReferenceCollectionConfig so categories + brands share one body, delegating the shared
 * pagination/coverage/prune scaffolding to createGreedyCollectionFetcher. These datasets are tiny so a greedy
 * full pull is cheap and correct (greedy is for small required datasets only).
 *
 * Unlike tax (the G1 exception), reference docs carry uuid identity (P0-1 emit-flip) AND a set-difference prune,
 * so the storage id (uuid) and coverage id (woo-<prefix>:<wooId>) are DISTINCT — the generic keeps them separate.
 */

import type { SchedulerFetcher } from './replication-scheduler';
import { referenceDocumentId, type LocalReferenceDocument, type WooReferencePayload } from '../collections/reference-collection-schema';
import { materializeGreedyPrunable } from '../materialization/record-materialization';
import { createGreedyCollectionFetcher, type CollectionSchedulerCoverageRepository, type CollectionSchedulerInput } from './rx-scheduler-collection-fetcher';

export type ReferenceSchedulerCoverageRepository = CollectionSchedulerCoverageRepository;
export type ReferenceSchedulerFetcherInput = CollectionSchedulerInput<LocalReferenceDocument>;

/** Identifies one reference collection: its scheduler identity + REST endpoint + doc-id prefix. */
export type ReferenceCollectionConfig = {
  /** Scheduler collection name, e.g. 'categories' | 'brands'. */
  collection: string;
  /** The greedy lane queryKey, e.g. 'categories:all' | 'brands:all'. */
  queryKey: string;
  /** Resource path under the sync namespace (no leading slash), e.g. 'products/categories' | 'products/brands'. */
  endpoint: string;
  /** Document-id prefix, e.g. 'woo-category' | 'woo-brand'. */
  documentIdPrefix: string;
};

function referenceDocumentFromWooPayload(config: ReferenceCollectionConfig, payload: WooReferencePayload): LocalReferenceDocument {
  return materializeGreedyPrunable(payload).storedDocument;
}

/**
 * The COVERAGE-record id for a reference doc — the stable Woo-id-space key (`woo-<prefix>:<wooId>`), NOT the uuid
 * STORAGE key (P0-1). Coverage/lane ids stay in this space so a current/future targeted lane (which extracts
 * wooId) and coverage's expectedRecordIds agree; keying coverage by the uuid would make the lane never satisfy.
 * DISTINCT from the deletion-prune key (which compares stored doc.id = uuid). A born-local doc (wooId null) falls
 * through to its storage id.
 */
function referenceCoverageRecordId(config: ReferenceCollectionConfig, document: { id: string; wooId: number | null }): string {
  return document.wooId === null ? document.id : referenceDocumentId(config.documentIdPrefix, document.wooId);
}

export function createReferenceCollectionFetcher(
  config: ReferenceCollectionConfig,
  input: ReferenceSchedulerFetcherInput,
): SchedulerFetcher {
  return createGreedyCollectionFetcher<LocalReferenceDocument, WooReferencePayload>(
    {
      collection: config.collection,
      greedyQueryKey: config.queryKey,
      endpoint: config.endpoint,
      documentFromPayload: (payload) => referenceDocumentFromWooPayload(config, payload),
      storageId: (document) => document.id, // uuid STORAGE key — for the prune kept-set
      coverageRecordId: (document) => referenceCoverageRecordId(config, document), // Woo-id-space — DISTINCT
      prunable: true, // reference participates in set-difference deletion; always reports prunedCount
    },
    input,
  );
}

/** The two reference collections the POS bootstrap pulls greedily. */
export const CATEGORY_REFERENCE_CONFIG: ReferenceCollectionConfig = {
  collection: 'categories',
  queryKey: 'categories:all',
  endpoint: 'products/categories',
  documentIdPrefix: 'woo-category',
};

export const BRAND_REFERENCE_CONFIG: ReferenceCollectionConfig = {
  collection: 'brands',
  queryKey: 'brands:all',
  endpoint: 'products/brands',
  documentIdPrefix: 'woo-brand',
};

export const TAG_REFERENCE_CONFIG: ReferenceCollectionConfig = {
  collection: 'tags',
  queryKey: 'tags:all',
  endpoint: 'products/tags',
  documentIdPrefix: 'woo-tag',
};

// Coupons ride the same generic greedy pull-only mechanism (the endpoint is top-level
// `coupons`, not under `products/`). Server-side their uuid comes from a post stamper,
// but the client contract is identical: a uuid-keyed reference document.
export const COUPON_REFERENCE_CONFIG: ReferenceCollectionConfig = {
  collection: 'coupons',
  queryKey: 'coupons:all',
  endpoint: 'coupons',
  documentIdPrefix: 'woo-coupon',
};
