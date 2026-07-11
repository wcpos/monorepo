/** Engine-private payload -> stored-document boundary, partitioned by descriptor shape. */
import {
  identifyRecord,
  normalizeCheckpoint,
  promotedProductColumns,
  type OrderDocument,
  type WooOrderPayload,
  type WooProductPayload,
} from '@woo-rxdb-lab/shared';
import { adoptStampedRevision } from '../write-path/adopt-stamped-revision';
import type { LocalCustomerDocument, WooCustomerPayload } from '../collections/customer-schema';
import { existenceManifestDocument, type ExistenceManifestDocument } from '../local-coverage/existence-manifest-schema';
import type { LocalReferenceDocument, WooReferencePayload } from '../collections/reference-collection-schema';
import { taxRateDocumentId, type LocalTaxRateDocument, type WooTaxRatePayload } from '../collections/tax-rate-schema';
import { promotedVariationColumns, type WooVariationPayload } from '../collections/variation-schema';

type Payload = Record<string, unknown> & { id?: number };
export type Materialized<T> = { storedDocument: T; manifestRow?: ExistenceManifestDocument };
const manifestMetadata = Symbol('record-materialization-manifest');
export function manifestRowOf(value: object): ExistenceManifestDocument | undefined {
  return (value as { [manifestMetadata]?: ExistenceManifestDocument })[manifestMetadata];
}
function result<T extends object>(storedDocument: T, manifestRow?: ExistenceManifestDocument): Materialized<T> {
  if (manifestRow) Object.defineProperty(storedDocument, manifestMetadata, { value: manifestRow });
  return { storedDocument, ...(manifestRow ? { manifestRow } : {}) };
}

function requireId(payload: Payload, label: string): number {
  const id = Number(payload.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Woo REST ${label} response contained an invalid id`);
  return id;
}
function identity(payload: Payload) {
  return identifyRecord(payload, { mintUuid: () => globalThis.crypto.randomUUID(), mintOnMissing: false });
}
function digest(payload: Payload, wooId: number, objectType: 'product'|'variation'|'customer'|'order') {
  const value = payload._rxdb_digest;
  if (typeof value !== 'string' || value === '') return undefined;
  return existenceManifestDocument({ wooId, objectType, digest: value });
}
function stripDigest<T extends Payload>(payload: T): T {
  if (!('_rxdb_digest' in payload)) return payload;
  const clean = { ...payload }; delete clean._rxdb_digest; return clean;
}

export function materializeTargeted(collection: 'products'|'variations'|'customers', raw: Payload): Materialized<Record<string, unknown>> {
  const label = collection === 'products' ? 'product' : collection === 'variations' ? 'variation' : 'customer';
  const wooId = requireId(raw, label);
  const legacy = collection === 'customers'
    ? () => String((raw as WooCustomerPayload).date_modified_gmt ?? (raw as WooCustomerPayload).date_modified ?? '')
    : () => String(raw.date_modified_gmt ?? (collection === 'variations' ? wooId : ''));
  const adopted = adoptStampedRevision(raw, legacy);
  const manifestRow = digest(adopted.payload, wooId, label);
  const identified = identity(stripDigest(adopted.payload));
  const common = { id: identified.id, payload: identified.payload, sync: { revision: adopted.revision, partial: false, source: 'woo-rest' as const } };
  if (collection === 'products') return result({ ...common, wooProductId: wooId, ...promotedProductColumns(identified.payload as WooProductPayload), local: { dirty: false, pendingMutationIds: [] } }, manifestRow);
  if (collection === 'variations') return result({ ...common, wooId, parentId: Number.isFinite(Number(identified.payload.parent_id)) ? Number(identified.payload.parent_id) : null, ...promotedVariationColumns(identified.payload as WooVariationPayload) }, manifestRow);
  return result({ ...common, wooCustomerId: wooId, local: { dirty: false, pendingMutationIds: [] } } satisfies LocalCustomerDocument, manifestRow);
}

export function materializeGreedyPrunable(raw: WooReferencePayload): Materialized<LocalReferenceDocument> {
  const wooId = requireId(raw, 'reference');
  const adopted = adoptStampedRevision(raw, () => String(raw.id ?? ''));
  const identified = identity(stripDigest(adopted.payload));
  return { storedDocument: { id: identified.id, wooId, payload: identified.payload, sync: { revision: adopted.revision, partial: false, source: 'woo-rest' } } };
}

export function materializeUpsertRefresh(raw: WooTaxRatePayload): Materialized<LocalTaxRateDocument> {
  const wooTaxRateId = requireId(raw, 'tax-rate');
  const adopted = adoptStampedRevision(raw, () => String(raw.id ?? ''));
  return { storedDocument: { id: taxRateDocumentId(wooTaxRateId), wooTaxRateId, payload: stripDigest(adopted.payload), sync: { revision: adopted.revision, partial: false, source: 'woo-rest' } } };
}

export function materializeLocalOnly(raw: WooOrderPayload, envelope?: Pick<OrderDocument, 'sync'|'local'>): Materialized<OrderDocument> {
  const wooOrderId = requireId(raw, envelope ? 'custom-pull order payload' : 'targeted order');
  const adopted = envelope ? { payload: raw, revision: envelope.sync.revision } : adoptStampedRevision(raw, () => String(raw.date_modified_gmt ?? ''));
  const manifestRow = digest(adopted.payload, wooOrderId, 'order');
  const identified = identity(stripDigest(adopted.payload));
  const sync = envelope?.sync ?? { revision: adopted.revision, partial: false, source: 'woo-rest' as const, checkpoint: normalizeCheckpoint({ updatedAtGmt: String(raw.date_modified_gmt ?? '1970-01-01T00:00:00.000Z'), orderId: wooOrderId, revision: adopted.revision }) };
  const document = { id: identified.id, wooOrderId, payload: identified.payload, sync, local: envelope?.local ?? { dirty: false, pendingMutationIds: [] } } as OrderDocument;
  return result(document, manifestRow);
}

/** Storage-adapter entry for already assembled/local order documents. */
export function materializeExistingLocalOnly(document: OrderDocument): Materialized<OrderDocument> {
  const wooOrderId = document.wooOrderId;
  const manifestRow = wooOrderId == null ? undefined : digest(document.payload, wooOrderId, 'order');
  return result({ ...document, payload: stripDigest(document.payload) }, manifestRow);
}
