import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';
import get from 'lodash/get';
import set from 'lodash/set';

import type {
	CouponDocument,
	CustomerDocument,
	OrderDocument,
	ProductDocument,
	ProductVariationDocument,
} from '@wcpos/database';
import {
	adapterDerivedFieldsFor,
	COLLECTION_VOCABULARY,
	promotedColumnsFor,
	useQueryRuntime,
	type WriteableCollection,
} from '@wcpos/query';
import { deriveBarcodeFromPayload, mapBarcodeEditToPayload } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/error-codes';

import { useT } from '../../../../contexts/translations';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';

import type { RxDocument } from 'rxdb';

const mutationLogger = getLogger(['wcpos', 'mutations', 'local']);

type Document =
	OrderDocument | ProductDocument | CustomerDocument | ProductVariationDocument | CouponDocument;

const WRITEABLE_COLLECTIONS = new Set<WriteableCollection>(
	Object.entries(COLLECTION_VOCABULARY)
		.filter(([, row]) => row.writeable)
		.map(([name]) => name as WriteableCollection)
);

type QueryManager = ReturnType<typeof useQueryRuntime>;
type EngineResident = RxDocument<Record<string, unknown>>;

class ActiveScopeChangedTwiceError extends Error {
	public constructor(collection: WriteableCollection) {
		super(`Active engine scope changed twice during ${collection} mutation`);
		this.name = 'ActiveScopeChangedTwiceError';
	}
}

interface LocalPatchProps<T extends Document> {
	document: T;
	data: Partial<T>;
}

function writeableCollection(name: string | undefined): WriteableCollection | null {
	return name && WRITEABLE_COLLECTIONS.has(name as WriteableCollection)
		? (name as WriteableCollection)
		: null;
}

export function documentRecordId(document: unknown): string | null {
	if (!document || typeof document !== 'object') return null;
	const value = document as Record<string, unknown>;
	const identity = value.uuid ?? value.id;
	return typeof identity === 'string' && identity.length > 0 ? identity : null;
}

function withPromotedFields(
	collection: WriteableCollection,
	resident: Record<string, unknown>
): Record<string, unknown> {
	const payload = (resident.payload ?? {}) as Record<string, unknown>;
	return { ...resident, ...promotedColumnsFor(collection, payload) };
}

function syncableChanges(
	collection: WriteableCollection,
	changes: Record<string, unknown>
): Record<string, unknown> {
	const adapterDerivedFields = new Set(adapterDerivedFieldsFor(collection));
	return Object.fromEntries(
		Object.entries(changes).filter(([field]) => !adapterDerivedFields.has(field))
	);
}

function ensureRecordMetadata(
	payload: Record<string, unknown>,
	recordId: string
): Record<string, unknown> {
	const metadata = Array.isArray(payload.meta_data)
		? [...(payload.meta_data as Record<string, unknown>[])]
		: [];
	const index = metadata.findIndex((entry) => entry.key === '_woocommerce_pos_uuid');
	const identity = { key: '_woocommerce_pos_uuid', value: recordId };
	if (index === -1) metadata.push(identity);
	else metadata[index] = { ...metadata[index], ...identity };
	return { ...payload, meta_data: metadata };
}

/**
 * The barcode carriers of the engine's ACTIVE scope. Read per edit off the scope
 * being written to, so a store switch cannot map an edit onto the previous
 * site's carrier field; `[]` when the scope has none yet.
 */
function activeBarcodeSelectors(
	manager: QueryManager,
	collection: WriteableCollection
): readonly string[] {
	if (collection !== 'products' && collection !== 'variations') return [];
	return manager.engine.active()?.barcodeSelectors[collection] ?? [];
}

async function activeCollection(manager: QueryManager, collection: WriteableCollection) {
	const scope = manager.engine.active() ?? (await manager.engine.ready);
	const residentCollection = scope.database.collections[collection];
	if (!residentCollection) {
		throw new Error(`Engine collection "${collection}" is unavailable`);
	}
	return residentCollection;
}

export async function findEngineResident(
	manager: QueryManager,
	collection: WriteableCollection,
	recordId: string
): Promise<EngineResident | null> {
	const residentCollection = await activeCollection(manager, collection);
	return (await residentCollection.findOne(recordId).exec()) as EngineResident | null;
}

export async function patchEngineResident(input: {
	manager: QueryManager;
	collection: WriteableCollection;
	recordId: string;
	changes: Record<string, unknown>;
}): Promise<EngineResident> {
	const resident = await findEngineResident(input.manager, input.collection, input.recordId);
	if (!resident) {
		throw new Error(`Engine resident "${input.recordId}" is missing from "${input.collection}"`);
	}
	return applyEngineResidentChanges(
		resident,
		input.collection,
		input.changes,
		activeBarcodeSelectors(input.manager, input.collection)
	);
}

async function applyEngineResidentChanges(
	resident: EngineResident,
	collection: WriteableCollection,
	changes: Record<string, unknown>,
	selectors: readonly string[]
): Promise<EngineResident> {
	return (await resident.incrementalModify((old) => {
		const priorPayload = (old.payload ?? {}) as Record<string, unknown>;
		let payload = cloneDeep(priorPayload);
		for (const [field, value] of Object.entries(syncableChanges(collection, changes))) {
			set(payload, field, value);
		}
		if (collection === 'products' || collection === 'variations') {
			const prior = typeof priorPayload.barcode === 'string' ? priorPayload.barcode.trim() : '';
			const edited = typeof changes.barcode === 'string' ? changes.barcode.trim() : undefined;
			if (edited !== undefined && edited !== prior) {
				// An intentional barcode edit: write the real carrier and keep the
				// materialized field in step.
				payload = mapBarcodeEditToPayload(payload, selectors);
				payload.barcode = edited;
			} else {
				// No barcode edit (or the form echoed the unchanged derived value):
				// a direct carrier edit (sku / global_unique_id / meta entry) wins,
				// so re-derive the materialized field from the carrier instead of
				// mapping the stale barcode back over the user's change. Absent or
				// empty carriers leave the stored value alone (never clobber).
				const derived = deriveBarcodeFromPayload(payload, selectors);
				if (derived !== undefined) payload.barcode = derived;
			}
		}
		return withPromotedFields(collection, { ...old, payload });
	})) as EngineResident;
}

/**
 * Full-form saves echo the unchanged derived `barcode` back alongside a direct
 * carrier edit (sku / global_unique_id / meta entry). Strip the echo before
 * enqueueing so the push adapter's barcode→carrier mapping cannot replay the
 * stale value over the user's carrier edit; an INTENTIONAL barcode edit (value
 * differs from the stored materialized one) passes through untouched.
 */
function withoutEchoedBarcode(
	collection: WriteableCollection,
	changes: Record<string, unknown>,
	previousPayload: Record<string, unknown>
): Record<string, unknown> {
	if (collection !== 'products' && collection !== 'variations') return changes;
	if (typeof changes.barcode !== 'string') return changes;
	const prior = typeof previousPayload.barcode === 'string' ? previousPayload.barcode.trim() : '';
	if (changes.barcode.trim() !== prior) return changes;
	const { barcode: _echoed, ...rest } = changes;
	return rest;
}

export async function patchAndEnqueueEngineResident(input: {
	manager: QueryManager;
	collection: WriteableCollection;
	recordId: string;
	changes: Record<string, unknown>;
}): Promise<void> {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		const scopeId = input.manager.engine.status().activeScopeId;
		const resident = await findEngineResident(input.manager, input.collection, input.recordId);
		if (!resident) {
			throw new Error(`Engine resident "${input.recordId}" is missing from "${input.collection}"`);
		}
		const previousResident = cloneDeep(resident.toJSON());
		await applyEngineResidentChanges(
			resident,
			input.collection,
			input.changes,
			activeBarcodeSelectors(input.manager, input.collection)
		);

		let writeError: unknown;
		try {
			await input.manager.engine.write({
				collection: input.collection,
				// Creation funnels insert the resident and enqueue the create first.
				// Later local edits are updates; the write plane folds create + update
				// into the pending create, or queues behind an in-flight create.
				operation: 'update',
				recordId: input.recordId,
				payload: withoutEchoedBarcode(
					input.collection,
					input.changes,
					(previousResident.payload ?? {}) as Record<string, unknown>
				),
			});
		} catch (error) {
			writeError = error;
		}

		if (input.manager.engine.status().activeScopeId !== scopeId) {
			await resident.incrementalModify(() => previousResident);
			if (attempt === 1) {
				throw new ActiveScopeChangedTwiceError(input.collection);
			}
			continue;
		}

		if (writeError) {
			await resident.incrementalModify(() => previousResident);
			throw writeError;
		}
		return;
	}
}

export async function insertEngineResident(input: {
	manager: QueryManager;
	collection: WriteableCollection;
	recordId: string;
	payload: Record<string, unknown>;
}): Promise<EngineResident> {
	const residentCollection = await activeCollection(input.manager, input.collection);
	const payload = ensureRecordMetadata(
		syncableChanges(input.collection, input.payload),
		input.recordId
	);
	const common: Record<string, unknown> = {
		id: input.recordId,
		payload,
		sync: {
			revision: '',
			partial: false,
			source: input.collection === 'orders' ? 'skeleton' : 'local',
		},
		local: { dirty: false, pendingMutationIds: [] },
	};
	const remoteId = Number(payload.id);
	const resident = withPromotedFields(input.collection, {
		...common,
		...(input.collection === 'orders'
			? { wooOrderId: remoteId > 0 ? remoteId : null }
			: input.collection === 'products'
				? { wooProductId: remoteId > 0 ? remoteId : null }
				: input.collection === 'customers'
					? { wooCustomerId: remoteId > 0 ? remoteId : null }
					: { wooId: remoteId > 0 ? remoteId : null }),
	});
	return (await residentCollection.insert(resident)) as EngineResident;
}

async function patchLocalResident<T extends Document>(
	document: T,
	changes: Record<string, unknown>
): Promise<T> {
	return (await document.incrementalModify(((old: Record<string, unknown>) => ({
		...old,
		...changes,
	})) as never)) as T;
}

/**
 * Local mutation has an intentional per-field split:
 * - fields on engine-writeable documents are applied optimistically to the resident payload and
 *   sent through durable write-intents, except adapter-derived identity/computed fields;
 * - genuinely local documents (for example store settings) are written through
 *   `patchLocalResident` and never enter the sync queue.
 */
export const useLocalMutation = () => {
	const t = useT();
	const manager = useQueryRuntime();

	const localPatch = React.useCallback(
		async <T extends Document>({ document, data }: LocalPatchProps<T>) => {
			try {
				const patchData = { ...(data as Record<string, unknown>) };
				const collectionName = document.collection?.name;
				const engineCollection = writeableCollection(collectionName);
				const isTemporaryOrder =
					engineCollection === 'orders' &&
					Boolean((document as unknown as { isNew?: boolean }).isNew);
				const hasDate =
					engineCollection && !isTemporaryOrder
						? true
						: get(document, 'collection.schema.jsonSchema.properties.date_modified_gmt');
				if (hasDate) {
					patchData.date_modified_gmt = convertLocalDateToUTCString(new Date());
				}

				const latest = document.getLatest();
				const patchEntries = Object.entries(patchData).filter(([, value]) => value !== undefined);
				if (patchEntries.length === 0) {
					return { changes: {}, document: latest };
				}

				const snapshot = latest.toMutableJSON?.() ?? (latest as unknown as Record<string, unknown>);
				const changes: Record<string, unknown> = {};
				for (const [key, value] of patchEntries) {
					const [root, ...path] = key.split('.');
					if (path.length === 0) {
						changes[root] = value;
						continue;
					}
					const rootValue = cloneDeep((snapshot as Record<string, unknown>)[root]);
					changes[root] = set(
						(rootValue ?? (Number.isInteger(Number(path[0])) ? [] : {})) as object,
						path,
						value
					);
				}

				if (engineCollection && !isTemporaryOrder) {
					const recordId = documentRecordId(document);
					if (!recordId) throw new Error(`Missing uuid for ${engineCollection} mutation`);
					const syncChanges = syncableChanges(engineCollection, changes);
					if (Object.keys(syncChanges).length > 0) {
						await patchAndEnqueueEngineResident({
							manager,
							collection: engineCollection,
							recordId,
							changes: syncChanges,
						});
					} else {
						await patchEngineResident({
							manager,
							collection: engineCollection,
							recordId,
							changes: syncChanges,
						});
					}
					return { changes, document: document.getLatest() };
				}

				const doc = await patchLocalResident(latest, changes);
				return { changes, document: doc };
			} catch (error) {
				const err = error as Record<string, unknown>;
				let message = error instanceof Error ? error.message : String(error);
				let errorCode: string = ERROR_CODES.TRANSACTION_FAILED;
				if (err.rxdb) {
					message = 'rxdb ' + String(err.code);
					errorCode = ERROR_CODES.CONSTRAINT_VIOLATION;
				}
				mutationLogger.error(t('common.there_was_an_error', { message }), {
					showToast: true,
					saveToDb: true,
					context: {
						errorCode,
						documentId: document.id,
						collectionName: document.collection?.name,
						error: message,
					},
				});
				if (error instanceof ActiveScopeChangedTwiceError) {
					throw error;
				}
			}
		},
		[manager, t]
	);

	return { localPatch };
};
