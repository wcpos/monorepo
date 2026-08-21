import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';
import get from 'lodash/get';
import set from 'lodash/set';

import {
	adapterDerivedFieldsFor,
	COLLECTION_VOCABULARY,
	engineCollection,
	type EngineRecord,
	promotedColumnsFor,
	useQueryRuntime,
	type WriteableCollection,
} from '@wcpos/query';
import {
	deriveBarcodeFromPayload,
	mapBarcodeEditToPayload,
	RECORD_UUID_META_KEY,
	remoteIdOrNull,
} from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES, type ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';

import { useT } from '../../../../contexts/translations';
import {
	getTemporaryOrder,
	patchTemporaryOrderPayload,
} from '../../pos/contexts/current-order/temporary-order';
import { convertLocalDateToUTCString } from '../../../../hooks/use-local-date';

import type { RxDocument } from 'rxdb';

const mutationLogger = getLogger(['wcpos', 'mutations', 'local']);

export type MutationDocument =
	| EngineRecord<'orders'>
	| EngineRecord<'products'>
	| EngineRecord<'variations'>
	| EngineRecord<'customers'>
	| EngineRecord<'coupons'>
	| import('@wcpos/database').TemporaryOrderDocument;

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

interface LocalPatchProps<TDocument extends MutationDocument, TData extends object> {
	document: TDocument;
	data: TData;
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
	const index = metadata.findIndex((entry) => entry.key === RECORD_UUID_META_KEY);
	const identity = { key: RECORD_UUID_META_KEY, value: recordId };
	if (index === -1) metadata.push(identity);
	else metadata[index] = { ...metadata[index], ...identity };
	return { ...payload, meta_data: metadata };
}

function residentPayload(document: EngineResident): Record<string, unknown> {
	const snapshot = document.toMutableJSON?.() ?? document.toJSON();
	return (snapshot.payload ?? {}) as Record<string, unknown>;
}

type EngineScope = NonNullable<ReturnType<QueryManager['engine']['active']>>;

/**
 * ONE resolution of the active scope. Callers that both READ a resident and map
 * a barcode edit must derive the database and the carriers from the SAME scope
 * object: resolving them separately straddles an await, and a store switch
 * landing in that window would map the edit by the new scope's carriers (or by
 * none, if that scope has not hydrated) and write it into the old scope's row.
 */
async function activeScope(manager: QueryManager): Promise<EngineScope> {
	return manager.engine.active() ?? (await manager.engine.ready);
}

/** The barcode carriers of the scope an edit is being applied IN — never a
 * later active one. `[]` for collections with no barcode facet, and for a scope
 * that has not hydrated (the documented online-fallback reading). */
function scopeBarcodeSelectors(
	scope: EngineScope,
	collection: WriteableCollection
): readonly string[] {
	if (collection !== 'products' && collection !== 'variations') return [];
	return scope.barcodeSelectors[collection] ?? [];
}

function residentCollectionIn(scope: EngineScope, collection: WriteableCollection) {
	const residentCollection = engineCollection(scope.database, collection);
	if (!residentCollection) {
		throw new Error(`Engine collection "${collection}" is unavailable`);
	}
	return residentCollection;
}

async function findEngineResidentIn(
	scope: EngineScope,
	collection: WriteableCollection,
	recordId: string
): Promise<EngineResident | null> {
	return (await residentCollectionIn(scope, collection)
		.findOne(recordId)
		.exec()) as unknown as EngineResident | null;
}

type ScopedEngineResident = { scope: EngineScope; resident: EngineResident };

async function resolveEngineResident(
	manager: QueryManager,
	collection: WriteableCollection,
	recordId: string
): Promise<ScopedEngineResident | null> {
	const scope = await activeScope(manager);
	const resident = await findEngineResidentIn(scope, collection, recordId);
	return resident ? { scope, resident } : null;
}

export async function findEngineResident(
	manager: QueryManager,
	collection: WriteableCollection,
	recordId: string
): Promise<EngineResident | null> {
	return (await resolveEngineResident(manager, collection, recordId))?.resident ?? null;
}

export async function patchEngineResident(input: {
	manager: QueryManager;
	collection: WriteableCollection;
	recordId: string;
	changes: Record<string, unknown>;
}): Promise<EngineResident> {
	const scope = await activeScope(input.manager);
	const resident = await findEngineResidentIn(scope, input.collection, input.recordId);
	if (!resident) {
		throw new Error(`Engine resident "${input.recordId}" is missing from "${input.collection}"`);
	}
	return applyEngineResidentChanges(
		resident,
		input.collection,
		input.changes,
		scopeBarcodeSelectors(scope, input.collection)
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
	initial?: ScopedEngineResident;
}): Promise<EngineResident> {
	for (let attempt = 0; attempt < 2; attempt += 1) {
		// The rollback guard's baseline is the CAPTURED scope's own id, not a
		// second `status()` read. The resident, the barcode carriers and the
		// keep-or-roll-back decision are then provably about ONE scope — with two
		// independent reads the property held only because `engine.active()` is
		// evaluated in the same synchronous turn as `status()`, which is a fact
		// about the engine's internals rather than something this file states.
		const initial = attempt === 0 ? input.initial : undefined;
		const scope = initial?.scope ?? (await activeScope(input.manager));
		const scopeId = scope.scopeId;
		const resident =
			initial?.resident ?? (await findEngineResidentIn(scope, input.collection, input.recordId));
		if (!resident) {
			throw new Error(`Engine resident "${input.recordId}" is missing from "${input.collection}"`);
		}
		const previousResident = cloneDeep(resident.toJSON());
		await applyEngineResidentChanges(
			resident,
			input.collection,
			input.changes,
			scopeBarcodeSelectors(scope, input.collection)
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
		return resident;
	}
	throw new Error(`Unable to patch engine resident "${input.recordId}"`);
}

export async function insertEngineResident(input: {
	manager: QueryManager;
	collection: WriteableCollection;
	recordId: string;
	payload: Record<string, unknown>;
}): Promise<EngineResident> {
	const residentCollection = residentCollectionIn(
		await activeScope(input.manager),
		input.collection
	);
	const payload = ensureRecordMetadata(
		syncableChanges(input.collection, input.payload),
		input.recordId
	);
	const common: Record<string, unknown> = {
		uuid: input.recordId,
		payload,
		sync: {
			revision: '',
			partial: false,
			source: input.collection === 'orders' ? 'skeleton' : 'local',
		},
		local: { dirty: false, pendingMutationIds: [] },
	};
	const remoteId = remoteIdOrNull(payload.id);
	const resident = withPromotedFields(input.collection, {
		...common,
		remoteId,
	});
	return (await residentCollection.insert(resident)) as unknown as EngineResident;
}

async function patchLocalResident<T extends EngineResident>(
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
		async <TDocument extends MutationDocument, TData extends object>({
			document,
			data,
		}: LocalPatchProps<TDocument, TData>) => {
			try {
				const patchData = { ...(data as Record<string, unknown>) };
				const collectionName = document.collection?.name;
				const engineCollection = writeableCollection(collectionName);
				const isTemporaryOrder =
					engineCollection === 'orders' &&
					Boolean((document as unknown as { isNew?: boolean }).isNew);
				// Engine-writeable documents (including the engine-shaped temporary order,
				// whose date lives inside its payload) always stamp; genuinely-local
				// documents consult their own schema.
				const hasDate = engineCollection
					? true
					: get(document, 'collection.schema.jsonSchema.properties.date_modified_gmt');
				if (hasDate) {
					patchData.date_modified_gmt = convertLocalDateToUTCString(new Date());
				}

				const patchEntries = Object.entries(patchData).filter(([, value]) => value !== undefined);
				if (patchEntries.length === 0) {
					return { changes: {}, document };
				}

				const recordId = engineCollection ? documentRecordId(document) : null;
				if (engineCollection && !recordId) {
					throw new Error(`Missing uuid for ${engineCollection} mutation`);
				}
				let snapshot: Record<string, unknown>;
				let scopedEngineResident: ScopedEngineResident | null = null;
				if (isTemporaryOrder) {
					const resident = await getTemporaryOrder(recordId!);
					if (!resident) throw new Error('Temporary order is missing from the temporary DB');
					snapshot = residentPayload(resident as unknown as EngineResident);
				} else if (engineCollection) {
					scopedEngineResident = await resolveEngineResident(manager, engineCollection, recordId!);
					if (!scopedEngineResident) {
						throw new Error(`Engine resident "${recordId}" is missing from "${engineCollection}"`);
					}
					snapshot = residentPayload(scopedEngineResident.resident);
				} else {
					const latest = document.getLatest();
					snapshot = latest.toMutableJSON?.() ?? (latest as unknown as Record<string, unknown>);
				}
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

				if (isTemporaryOrder) {
					// The temporary order is engine-shaped (ADR 0028 stage I); the context
					// hands out the record face, so the write resolves the RAW template
					// through the temp-order repository and merges into its payload.
					const patched = await patchTemporaryOrderPayload(recordId!, changes);
					if (!patched) throw new Error('Temporary order is missing from the temporary DB');
					return {
						changes,
						document: patched as TDocument,
					};
				}

				if (engineCollection) {
					const syncChanges = syncableChanges(engineCollection, changes);
					let patched: EngineResident;
					if (Object.keys(syncChanges).length > 0) {
						patched = await patchAndEnqueueEngineResident({
							manager,
							collection: engineCollection,
							recordId: recordId!,
							changes: syncChanges,
							initial: scopedEngineResident!,
						});
					} else {
						patched = await applyEngineResidentChanges(
							scopedEngineResident!.resident,
							engineCollection,
							syncChanges,
							scopeBarcodeSelectors(scopedEngineResident!.scope, engineCollection)
						);
					}
					return {
						changes,
						document: patched as TDocument,
					};
				}

				const latest = document.getLatest() as unknown as EngineResident;
				const doc = await patchLocalResident(latest, changes);
				return { changes, document: doc as TDocument };
			} catch (error) {
				const err = error as Record<string, unknown>;
				let message = getErrorMessage(error);
				let errorCode: ErrorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED;
				if (err.rxdb) {
					message = 'rxdb ' + String(err.code);
					errorCode = ERROR_CODES.LOCAL_DB_WRITE_FAILED;
				}
				mutationLogger.error('Local mutation failed', {
					code: errorCode,
					showToast: true,
					toast: { title: t('common.there_was_an_error', { message }) },
					context: {
						documentId: documentRecordId(document),
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
