import { type OrderDocument } from '@wcpos/sync-core';

import type { ExistenceManifestDocument } from './existence-manifest-schema';
import type { Materialized } from '../materialization/record-materialization';

/**
 * Populate the Leg-3 existence manifest FROM the pull (ADR 0014 increment 4b). The server attaches each
 * served record's stored digest as a top-level `_rxdb_digest` string (#331); materialization reads it into
 * a manifest row on the `Materialized` envelope and STRIPS it from the stored payload, so the transient
 * reconcile fingerprint never pollutes the document.
 *
 * The INGEST SITE owns the rest (ADR 0028 rider): it upserts the documents, then pushes the rows of the
 * ones it actually applied. Repositories and decorators no longer extract anything — the row used to ride
 * the stored document on a non-enumerable Symbol, which any spread dropped silently (#1340). These are the
 * two pure helpers those sites share.
 */

const MANIFEST_DIGEST_FIELD = '_rxdb_digest';

/**
 * The manifest rows of the envelopes whose stored documents SURVIVED the apply guard.
 *
 * A row must never be recorded for a document that was filtered out — a pulled record the
 * pending-mutation guard skipped is NOT locally resident at the server's digest, and claiming it is
 * hides a real divergence from the existence reconcile. Matching is by `uuid`, the storage key both
 * sides carry.
 */
export function manifestRowsForApplied<T extends object>(
	materialized: readonly Materialized<T>[],
	applied: readonly { uuid: string }[]
): ExistenceManifestDocument[] {
	if (materialized.length === 0 || applied.length === 0) return [];
	const appliedUuids = new Set(applied.map((document) => document.uuid));
	return materialized.flatMap(({ storedDocument, manifestRow }) =>
		manifestRow && appliedUuids.has(String((storedDocument as { uuid?: unknown }).uuid))
			? [manifestRow]
			: []
	);
}

/**
 * The order document with `_rxdb_digest` removed from its payload (no-op when absent).
 *
 * Materialization already strips it, so this is the storage boundary's belt-and-braces: whatever
 * reaches EngineOrderRepository.upsertMany is stored, and a transport-only fingerprint must never
 * land in an order payload.
 */
export function stripOrderManifestDigest<T extends OrderDocument>(document: T): T {
	const payload = document.payload as Record<string, unknown> | undefined;
	if (!payload || !(MANIFEST_DIGEST_FIELD in payload)) {
		return document;
	}
	const cleaned = { ...payload };
	delete cleaned[MANIFEST_DIGEST_FIELD];
	return { ...document, payload: cleaned as OrderDocument['payload'] };
}
