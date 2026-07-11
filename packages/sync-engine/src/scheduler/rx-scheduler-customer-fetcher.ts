/**
 * Customer scheduler fetcher — an ON-DEMAND collection (targeted include= fetch by id, or search-windowed
 * paginate). A thin spec over the shared targeted/search core (createTargetedSearchCollectionFetcher); only the
 * customer-specific deltas live here: uuid identity, the dual-id-space coverage key, the document-id target
 * parser, the customer:default born-local sentinel, and the search-lane queryKey grammar.
 */

import type { SchedulerFetcher } from './replication-scheduler';
import type { FetchTask } from './replication-policy';
import { type LocalCustomerDocument, type WooCustomerPayload } from '../collections/customer-schema';
import { customerDocumentId } from '@woo-rxdb-lab/shared';
import { materializeTargeted } from '../materialization/record-materialization';
import {
  createTargetedSearchCollectionFetcher,
  type CollectionSchedulerCoverageRepository,
  type CollectionSchedulerInput,
  type CollectionTarget,
} from './rx-scheduler-collection-fetcher';

export type CustomerSchedulerCoverageRepository = CollectionSchedulerCoverageRepository;
export type CustomerSchedulerFetcherInput = CollectionSchedulerInput<LocalCustomerDocument>;

function customerTargetFromDocumentId(id: string): CollectionTarget {
  if (id === 'customer:default') {
    return { documentId: id, wooId: null };
  }
  const match = /^woo-customer:(\d+)$/.exec(id);
  if (!match) throw new Error(`Targeted customer scheduler task id is not a Woo customer document id: ${id}`);
  const wooCustomerId = Number(match[1]);
  return { documentId: customerDocumentId(wooCustomerId), wooId: wooCustomerId };
}

function revisionFromCustomer(payload: WooCustomerPayload): string {
  return String(payload.date_modified_gmt ?? payload.date_modified ?? '');
}

function customerDocumentFromWooPayload(payload: WooCustomerPayload): LocalCustomerDocument {
  return materializeTargeted('customers', payload).storedDocument as LocalCustomerDocument;
}

/**
 * The COVERAGE-record id for a customer — the stable Woo-id-space key (`woo-customer:<wooId>`), NOT the uuid
 * STORAGE key (P0-1). Coverage/lane ids stay in this space so the targeted side (which extracts wooCustomerId) and
 * the search lane's expectedRecordIds agree. The customer:default sentinel (wooCustomerId null) falls through to
 * its literal storage id.
 */
function customerCoverageRecordId(document: LocalCustomerDocument): string {
  return document.wooCustomerId === null ? document.id : customerDocumentId(document.wooCustomerId);
}

function defaultCustomerDocument(target: CollectionTarget): LocalCustomerDocument {
  return {
    id: target.documentId,
    wooCustomerId: null,
    payload: {},
    sync: { revision: '', partial: true, source: 'woo-rest' },
    local: { dirty: false, pendingMutationIds: [] },
  };
}

function parseCustomerSearchQuery(task: FetchTask): { search: string; queryLimit: number } | null {
  const match = /^customers:search=([^:]*):limit=(\d+)$/.exec(task.queryKey);
  if (!match) return null;
  return { search: decodeURIComponent(match[1] ?? ''), queryLimit: Number(match[2]) };
}

export function createCustomerSchedulerFetcher(input: CustomerSchedulerFetcherInput): SchedulerFetcher {
  return createTargetedSearchCollectionFetcher<LocalCustomerDocument, WooCustomerPayload>(
    {
      collection: 'customers',
      endpoint: 'customers',
      label: 'Customer',
      restLabel: 'customer',
      documentFromPayload: customerDocumentFromWooPayload,
      coverageRecordId: customerCoverageRecordId,
      payloadWooId: (payload) => Number(payload.id),
      targetFromId: customerTargetFromDocumentId,
      defaultDocument: defaultCustomerDocument,
      parseSearchQuery: parseCustomerSearchQuery,
    },
    input,
  );
}
