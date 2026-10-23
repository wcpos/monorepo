import cloneDeep from 'lodash/cloneDeep';
import set from 'lodash/set';

import {
	deriveBarcodeFromPayload,
	mapBarcodeEditToPayload,
	orderChangesAssertIntent,
	RECORD_UUID_META_KEY,
	remoteIdOrNull,
	remoteKeyFor,
} from '@wcpos/sync-core';

import {
	adapterDerivedFieldsFor,
	COLLECTION_VOCABULARY,
	promotedColumnsFor,
	type WriteableCollection,
} from '../engine-adapter/collection-map';
import { engineCollection } from '../records/engine-collection';
import { recordCollectionName } from '../records/engine-record';
import { getRegisterId } from '../register-session/register-document';
import { protectOrderMeta } from './protected-order-meta';

import type { QueryRuntime } from '../provider';
import type { ReadonlyEngineRecord } from '../records/readonly-engine-record';
import type { TemporaryOrderRecord } from '../temporary-order';
import type { RxDocument } from 'rxdb';

/** A read-only engine record of a writeable collection: what the push doors return. */
export type WriteableRecord = {
	[C in WriteableCollection]: ReadonlyEngineRecord<C>;
}[WriteableCollection];
/** A record the push doors can serve: it carries its own collection. An identity-only order needs `applyLocalPatch`'s `collectionName`. */
export type RecordWriteTarget = WriteableRecord | TemporaryOrderRecord;
type OrderIdentity = { readonly uuid: string; readonly isNew: boolean };
/** What a write door accepts: a read-only record, or an order's identity plus an explicit collection. */
export type WriteTarget = RecordWriteTarget | OrderIdentity;

const WRITEABLE_COLLECTIONS = new Set<WriteableCollection>(
	Object.entries(COLLECTION_VOCABULARY)
		.filter(([, row]) => row.writeable)
		.map(([name]) => name as WriteableCollection)
);

export type QueryManager = QueryRuntime;
export type EngineResident = RxDocument<Record<string, unknown>>;

export class ActiveScopeChangedTwiceError extends Error {
	public constructor(collection: WriteableCollection) {
		super(`Active engine scope changed twice during ${collection} mutation`);
		this.name = 'ActiveScopeChangedTwiceError';
	}
}

// Resolvers may run for pre-flight and each conflict retry; keep them free of external side effects.
export type PayloadChanges = (
	currentPayload: Record<string, unknown>,
	currentDocument?: Record<string, unknown>
) => Record<string, unknown>;

export type LocalPatchProps<TDocument extends WriteTarget, TData extends object> = {
	document: TDocument;
} & ({ data: TData; changes?: never } | { data?: never; changes: PayloadChanges });

export function writeableCollection(name: string | undefined): WriteableCollection | null {
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

/** The validated engine collection a write target lives in: the caller's explicit name first, else the record's own. */
export function writeTargetCollection(
	target: WriteTarget,
	explicit?: string
): WriteableCollection | null {
	return writeableCollection(explicit ?? recordCollectionName(target));
}

function withPromotedFields(
	collection: WriteableCollection,
	resident: Record<string, unknown>
): Record<string, unknown> {
	const payload = (resident.payload ?? {}) as Record<string, unknown>;
	return {
		...resident,
		...promotedColumnsFor(collection, payload),
		remoteKey: remoteKeyFor(resident.remoteId as string | null),
	};
}

export function syncableChanges(
	collection: WriteableCollection,
	changes: Record<string, unknown>
): Record<string, unknown> {
	const adapterDerivedFields = new Set(adapterDerivedFieldsFor(collection));
	return Object.fromEntries(
		Object.entries(changes).filter(([field]) => !adapterDerivedFields.has(field))
	);
}

/**
 * Is this change set worth a server request?
 *
 * For orders, a patch made ENTIRELY of the money aggregate is not (#1507). Those
 * fields are `readonly` in the wc/v3 order schema and `filter_writable_props()`
 * drops them before anything is set, so the push body would be discarded unread
 * — and its ack would then be compared, in `compareOrderMoney`, against a
 * payload asserting nothing but money the server was always going to overwrite.
 * The settlement's aggregate is still applied to the local record, because that
 * is what the cart displays and what an offline till runs on (ADR 0032 §4); it
 * simply stops being sent.
 *
 * A patch mixing money with real intent — a coupon replay's lines, a percent
 * fee's `fee_lines` — still enqueues. The aggregate riding along in it is
 * stripped on the outbound seam (`sanitizeOutboundOrderPayload`), which is also
 * what keeps it off a COALESCED payload: that snapshot re-layers the resident
 * record, aggregate and all.
 */
export function assertsSomething(
	collection: WriteableCollection,
	changes: Record<string, unknown>,
	current?: Record<string, unknown>
): boolean {
	return collection === 'orders' ? orderChangesAssertIntent(changes, current) : true;
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

export function residentPayload(document: EngineResident): Record<string, unknown> {
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
	return manager.engine.whenActive();
}

/** The barcode carriers of the scope an edit is being applied IN — never a
 * later active one. `[]` for collections with no barcode facet, and for a scope
 * that has not hydrated (the documented online-fallback reading). */
export function scopeBarcodeSelectors(
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

export type ScopedEngineResident = { scope: EngineScope; resident: EngineResident };

export async function resolveEngineResident(
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

export async function applyEngineResidentChanges(
	resident: EngineResident,
	collection: WriteableCollection,
	changes: Record<string, unknown> | PayloadChanges,
	selectors: readonly string[]
): Promise<EngineResident> {
	return (await resident.incrementalModify((old) => {
		const priorPayload = (old.payload ?? {}) as Record<string, unknown>;
		const resolved = typeof changes === 'function' ? changes(priorPayload, old) : changes;
		if (typeof changes === 'function' && Object.keys(resolved).length === 0) {
			// A race after a nonempty pre-flight may now yield nothing. Deliberately
			// accept RxDB's identical-content revision bump, without stamping or enqueueing.
			return old;
		}
		let payload = cloneDeep(priorPayload);
		for (const [field, value] of Object.entries(syncableChanges(collection, resolved))) {
			set(payload, field, value);
		}
		if (collection === 'products' || collection === 'variations') {
			const prior = typeof priorPayload.barcode === 'string' ? priorPayload.barcode.trim() : '';
			const edited = typeof resolved.barcode === 'string' ? resolved.barcode.trim() : undefined;
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
	changes: Record<string, unknown> | PayloadChanges;
	initial?: ScopedEngineResident;
	registerId?: string;
	tillId?: string;
	/** Told the queued row's id once the write sticks, so a caller can follow its outcome. */
	onEnqueued?: (mutationId: string) => void;
	/** Queue an explicit row: the cashier asked for this push, so the open-cart hold releases it. */
	explicit?: boolean;
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
		if (typeof input.changes === 'function') {
			const latest = resident.getLatest();
			// Avoid even a revision bump for an already-empty resolver. The modifier
			// below remains authoritative if the payload changes after this pure check.
			if (Object.keys(input.changes(residentPayload(latest))).length === 0) return latest;
		}
		const previousResident = cloneDeep(resident.toJSON());
		let changes: Record<string, unknown> = {};
		let shouldEnqueue = true;
		const patched = await applyEngineResidentChanges(
			resident,
			input.collection,
			(currentPayload) => {
				changes =
					typeof input.changes === 'function' ? input.changes(currentPayload) : input.changes;
				const collection = input.collection;
				if (collection === 'orders') changes = protectOrderMeta(currentPayload, changes);
				shouldEnqueue =
					typeof input.changes !== 'function' ||
					(Object.keys(changes).length > 0 &&
						assertsSomething(collection, changes, currentPayload));
				const identities = [
					['_wcpos_register', input.registerId],
					['_wcpos_till', input.tillId ?? getRegisterId()],
				] as const;
				const meta = (currentPayload.meta_data ?? []) as { key?: string; value?: unknown }[];
				if (shouldEnqueue && collection === 'orders') {
					for (const [key, value] of identities) {
						const existing = meta.find((entry) => entry.key === key);
						const incoming = changes.meta_data === undefined ? meta : changes.meta_data;
						if (
							Array.isArray(incoming) &&
							!incoming.some((entry) => entry.key === key) &&
							(existing || value)
						) {
							changes = { ...changes, meta_data: [...incoming, existing ?? { key, value }] };
						}
					}
				}
				return changes;
			},
			scopeBarcodeSelectors(scope, input.collection)
		);
		if (!shouldEnqueue) {
			return patched;
		}

		let writeError: unknown;
		let mutationId: string | undefined;
		try {
			({ mutationId } = await input.manager.engine.write({
				collection: input.collection,
				// Creation funnels insert the resident and enqueue the create first.
				// Later local edits are updates; the write plane folds create + update
				// into the pending create, or queues behind an in-flight create.
				operation: 'update',
				recordId: input.recordId,
				payload: withoutEchoedBarcode(
					input.collection,
					changes,
					(previousResident.payload ?? {}) as Record<string, unknown>
				),
				...(input.explicit ? { explicit: true } : {}),
			}));
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
		if (mutationId) input.onEnqueued?.(mutationId);
		return patched;
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
