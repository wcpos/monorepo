/** Engine-private payload -> stored-document boundary, partitioned by descriptor shape. */
import {
	deriveBarcodeFromPayload,
	identifyRecord,
	mintRemoteId,
	normalizeCheckpoint,
	type OrderDocument,
	promotedProductColumns,
	type RemoteId,
	remoteIdOrNull,
	taxRateDocumentId,
	wooIdOf,
	type WooOrderPayload,
	type WooProductPayload,
} from '@wcpos/sync-core';

import { adoptStampedRevision } from '../write-path/adopt-stamped-revision';
import {
	existenceManifestDocument,
	type ExistenceManifestDocument,
} from '../local-coverage/existence-manifest-schema';
import { type LocalTaxRateDocument, type WooTaxRatePayload } from '../collections/tax-rate-schema';
import {
	promotedVariationColumns,
	type WooVariationPayload,
} from '../collections/variation-schema';
import { stripNonStringMetaDisplayFields } from './strip-order-meta-display';

import type {
	LocalReferenceDocument,
	WooReferencePayload,
} from '../collections/reference-collection-schema';
import type { LocalCustomerDocument, WooCustomerPayload } from '../collections/customer-schema';

type Payload = Record<string, unknown> & { id?: number };
export type Materialized<T> = { storedDocument: T; manifestRow?: ExistenceManifestDocument };
const manifestMetadata = Symbol('record-materialization-manifest');
export function manifestRowOf(value: object): ExistenceManifestDocument | undefined {
	return (value as { [manifestMetadata]?: ExistenceManifestDocument })[manifestMetadata];
}
function result<T extends object>(
	storedDocument: T,
	manifestRow?: ExistenceManifestDocument
): Materialized<T> {
	if (manifestRow) Object.defineProperty(storedDocument, manifestMetadata, { value: manifestRow });
	return { storedDocument, ...(manifestRow ? { manifestRow } : {}) };
}

function identity(payload: Payload) {
	return identifyRecord(payload, {
		mintUuid: () => globalThis.crypto.randomUUID(),
		mintOnMissing: false,
	});
}
function digest(
	payload: Payload,
	remoteId: RemoteId,
	objectType: 'product' | 'variation' | 'customer' | 'order'
) {
	const value = payload._rxdb_digest;
	if (typeof value !== 'string' || value === '') return undefined;
	return existenceManifestDocument({ wooId: wooIdOf(remoteId), objectType, digest: value });
}
function stripDigest<T extends Payload>(payload: T): T {
	if (!('_rxdb_digest' in payload)) return payload;
	const clean = { ...payload };
	delete clean._rxdb_digest;
	return clean;
}

export function materializeTargeted(
	collection: 'products' | 'variations' | 'customers',
	raw: Payload,
	/**
	 * The barcode carriers active for the SCOPE this record is being materialized
	 * into (see materialization/barcode-selectors). Omitted or empty — the scope
	 * has none yet, or the collection has no barcode facet — materializes no
	 * `barcode` field, so a scan falls back to the online resolve instead of
	 * matching on a guessed one.
	 */
	barcodeSelectors: readonly string[] = []
): Materialized<Record<string, unknown>> {
	const label =
		collection === 'products' ? 'product' : collection === 'variations' ? 'variation' : 'customer';
	const remoteId = mintRemoteId(raw.id, `Woo REST ${label} response id`);
	const legacy =
		collection === 'customers'
			? () =>
					String(
						(raw as WooCustomerPayload).date_modified_gmt ??
							(raw as WooCustomerPayload).date_modified ??
							''
					)
			: () =>
					typeof raw.date_modified_gmt === 'string'
						? raw.date_modified_gmt
						: collection === 'variations'
							? remoteId
							: '';
	const adopted = adoptStampedRevision(raw, legacy);
	const manifestRow = digest(adopted.payload, remoteId, label);
	const barcode =
		collection === 'products' || collection === 'variations'
			? deriveBarcodeFromPayload(raw, barcodeSelectors)
			: undefined;
	const identified = identity(
		stripDigest(barcode === undefined ? adopted.payload : { ...adopted.payload, barcode })
	);
	const common = {
		uuid: identified.uuid,
		payload: identified.payload,
		sync: { revision: adopted.revision, partial: false, source: 'woo-rest' as const },
	};
	if (collection === 'products')
		return result(
			{
				...common,
				remoteId,
				...promotedProductColumns(identified.payload as WooProductPayload),
				local: { dirty: false, pendingMutationIds: [] },
			},
			manifestRow
		);
	if (collection === 'variations')
		return result(
			{
				...common,
				remoteId,
				parentRemoteId: remoteIdOrNull(identified.payload.parent_id),
				...promotedVariationColumns(identified.payload as WooVariationPayload),
				local: { dirty: false, pendingMutationIds: [] },
			},
			manifestRow
		);
	return result(
		{
			...common,
			remoteId,
			local: { dirty: false, pendingMutationIds: [] },
		} satisfies LocalCustomerDocument,
		manifestRow
	);
}

export function materializeGreedyPrunable(
	raw: WooReferencePayload
): Materialized<LocalReferenceDocument> {
	const remoteId = mintRemoteId(raw.id, 'Woo REST reference response id');
	const adopted = adoptStampedRevision(raw, () => remoteId);
	const identified = identity(stripDigest(adopted.payload));
	return {
		storedDocument: {
			uuid: identified.uuid,
			remoteId,
			payload: identified.payload,
			sync: { revision: adopted.revision, partial: false, source: 'woo-rest' },
			local: { dirty: false, pendingMutationIds: [] },
		},
	};
}

export function materializeUpsertRefresh(
	raw: WooTaxRatePayload
): Materialized<LocalTaxRateDocument> {
	const remoteId = mintRemoteId(raw.id, 'Woo REST tax-rate response id');
	const adopted = adoptStampedRevision(raw, () => remoteId);
	return {
		storedDocument: {
			uuid: taxRateDocumentId(remoteId),
			remoteId,
			payload: stripDigest(adopted.payload),
			sync: { revision: adopted.revision, partial: false, source: 'woo-rest' },
		},
	};
}

export function materializeLocalOnly(
	raw: WooOrderPayload,
	envelope?: Pick<OrderDocument, 'uuid' | 'sync' | 'local'>
): Materialized<OrderDocument> {
	const normalizedRaw = stripNonStringMetaDisplayFields(raw);
	const remoteId = mintRemoteId(
		normalizedRaw.id,
		envelope ? 'Woo REST custom-pull order payload id' : 'Woo REST targeted order id'
	);
	const adopted = envelope
		? { payload: normalizedRaw, revision: envelope.sync.revision }
		: adoptStampedRevision(normalizedRaw, () => String(normalizedRaw.date_modified_gmt ?? ''));
	const manifestRow = digest(adopted.payload, remoteId, 'order');
	const identified = identity(stripDigest(adopted.payload));
	const sync = envelope?.sync ?? {
		revision: adopted.revision,
		partial: false,
		source: 'woo-rest' as const,
		checkpoint: normalizeCheckpoint({
			updatedAtGmt: String(normalizedRaw.date_modified_gmt ?? '1970-01-01T00:00:00.000Z'),
			orderId: wooIdOf(remoteId),
			revision: adopted.revision,
		}),
	};
	const document = {
		uuid: envelope?.uuid ?? identified.uuid,
		remoteId,
		payload: identified.payload,
		sync,
		local: envelope?.local ?? { dirty: false, pendingMutationIds: [] },
	} as OrderDocument;
	return result(document, manifestRow);
}
