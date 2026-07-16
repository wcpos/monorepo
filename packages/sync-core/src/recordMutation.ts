import {
	identifyRecord,
	mirrorRecordUuid,
	type RecordIdOrigin,
	type WooRecordPayload,
} from './recordIdentity';

/**
 * The generic write-path foundation (P1-1): ONE collection-agnostic write-intent
 * model for EVERY collection — orders, products, variations, customers, tax_rates,
 * categories, brands — not a per-collection mutation type, and not the orders
 * special-case the deleted legacy `pushAdapter` baked in (G1).
 *
 * Built on the uniform UUID identity:
 *  - `recordId` IS the record's stable uuid primary key — minted client-side for a
 *    born-local create, reused from `_woocommerce_pos_uuid` for a server-born edit;
 *    NEVER re-keyed (`awaitingRemoteCreateUUID` reconciles the server's numeric id
 *    as a field, the key is already final).
 *  - `mutationId` is a separate idempotency key the server dedupes on, so an offline
 *    retry can't double-apply (a create can't double-insert).
 *
 * These builders are pure: identity + idempotency are injected (`mintUuid`, `now`),
 * so a host wires `crypto.randomUUID` / a clock and the logic stays unit-testable.
 * Per-collection write specifics (orders' refund/tax snapshot, products' barcode +
 * decimal qty, terms' name/slug) layer onto `payload` — they are not separate
 * engines.
 */

export type MutationOperation = 'create' | 'update' | 'delete';

export type RecordMutation = {
	/** Idempotency key — a fresh uuid per enqueue; the server dedupes retries on it. */
	mutationId: string;
	/** Collection key ('orders' | 'products' | …) — routes to the per-collection endpoint. */
	collectionName: string;
	operation: MutationOperation;
	/** The record's stable uuid PK — never re-keyed. */
	recordId: string;
	/** Provenance of `recordId` at enqueue: `minted` ⇒ born-local, awaiting the server create-ack. */
	origin: RecordIdOrigin;
	/** The body sent to the server. Create/update carry `_woocommerce_pos_uuid` mirrored in `meta_data`; delete carries the id only. */
	payload: Record<string, unknown>;
	/** Optimistic-concurrency anchor for an update; `null` for a create. */
	baseRevision: string | null;
	/** ISO timestamp — drives FIFO drain order. */
	queuedAt: string;
};

export type BuildMutationDeps = {
	/** Fresh uuid v4 — for `mutationId`, and (via `identifyRecord`) a born-local `recordId`. */
	mintUuid: () => string;
	/** Current time as an ISO string. */
	now: () => string;
};

/**
 * Enqueue a born-local create. A new record MINTS a fresh uuid — it never adopts a
 * `_woocommerce_pos_uuid` that happens to be in `payload.meta_data`, because a
 * clone/import carries the SOURCE record's uuid and reusing it would serve two
 * records under one key (the server treats exactly this as a collision). The only
 * non-minted id is an explicit `currentId` (a known local id being re-pushed). The
 * resolved id is mirrored into `meta_data`, overwriting any copied value, so the
 * server persists this record's own identity (`awaitingRemoteCreateUUID`).
 */
export function buildCreateMutation<T extends WooRecordPayload>(
	input: { collectionName: string; payload: T; currentId?: string | null },
	deps: BuildMutationDeps
): RecordMutation {
	const explicitId =
		typeof input.currentId === 'string' && input.currentId.length > 0 ? input.currentId : null;
	const recordId = explicitId ?? deps.mintUuid();
	const origin: RecordIdOrigin = explicitId ? 'existing' : 'minted';
	const createdAtGmt = input.collectionName === 'orders' ? input.payload.date_created_gmt : null;
	const payload =
		typeof createdAtGmt === 'string' &&
		createdAtGmt !== '' &&
		!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(createdAtGmt)
			? { ...input.payload, date_created_gmt: `${createdAtGmt}Z` }
			: input.payload;
	return {
		mutationId: deps.mintUuid(),
		collectionName: input.collectionName,
		operation: 'create',
		recordId,
		origin,
		payload: { ...payload, meta_data: mirrorRecordUuid(payload.meta_data, recordId) },
		baseRevision: null,
		queuedAt: deps.now(),
	};
}

/**
 * Enqueue an update to an existing record. Its identity is fixed (`currentId =
 * recordId`) and never minted or re-keyed; `mintOnMissing:false` makes a payload
 * that disagrees with `recordId` a hard error rather than a silent fork. The
 * payload's `meta_data` is mirrored to the id so a sparse edit still carries it.
 */
export function buildUpdateMutation<T extends WooRecordPayload>(
	input: { collectionName: string; recordId: string; payload: T; baseRevision: string | null },
	deps: BuildMutationDeps
): RecordMutation {
	const identified = identifyRecord(input.payload, {
		currentId: input.recordId,
		mintUuid: deps.mintUuid,
		mintOnMissing: false,
	});
	return {
		mutationId: deps.mintUuid(),
		collectionName: input.collectionName,
		operation: 'update',
		recordId: input.recordId,
		origin: identified.origin,
		payload: identified.payload,
		baseRevision: input.baseRevision,
		queuedAt: deps.now(),
	};
}

/**
 * Enqueue a delete of an existing record (by its stable uuid).
 *
 * `baseRevision` is REQUIRED: a delete targets a record that exists on the server
 * (a non-existent one resolves to an idempotent no-op), and the server refuses an
 * unconditional delete of an existing record with `428 Precondition Required` so a
 * stale delete can't destroy a record another client just updated. Pass the record's
 * last-seen `sync.revision`; an empty/missing precondition would be dead-lettered by
 * the drain, silently dropping the delete.
 */
export function buildDeleteMutation(
	input: { collectionName: string; recordId: string; baseRevision: string },
	deps: BuildMutationDeps
): RecordMutation {
	return {
		mutationId: deps.mintUuid(),
		collectionName: input.collectionName,
		operation: 'delete',
		recordId: input.recordId,
		origin: 'existing',
		payload: { id: input.recordId },
		baseRevision: input.baseRevision,
		queuedAt: deps.now(),
	};
}

/**
 * A queued create still awaiting its server ack — the `awaitingRemoteCreateUUID`
 * set whose server-assigned Woo id must be merged back into the open local record.
 * Every unpushed create is pending regardless of how its uuid was sourced (a
 * `currentId`-supplied create is created on the server too) — so this is keyed on
 * the operation, NOT the id origin.
 */
export function isAwaitingRemoteCreate(mutation: RecordMutation): boolean {
	return mutation.operation === 'create';
}

/** Re-export for consumers shaping payloads. */
