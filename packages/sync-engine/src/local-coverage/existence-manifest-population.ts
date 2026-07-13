import type { OrderDocument, ProductDocument } from '@wcpos/sync-core';

import {
	existenceManifestDocument,
	type ExistenceManifestDocument,
} from './existence-manifest-schema';
import { upsertManifestRows } from './rx-existence-manifest-repository';
import { manifestRowOf } from '../materialization/record-materialization';

import type { LocalCustomerDocument } from '../collections/customer-schema';

/**
 * Populate the Leg-3 existence manifest FROM the pull (ADR 0014 increment 4b). The server attaches each
 * served product's stored digest as a top-level `_rxdb_digest` string (#331); on upsert the client reads
 * it into a manifest row and STRIPS it from the stored payload, so the transient reconcile fingerprint
 * never pollutes the product document. Pure functions — the fetcher applies them before upsert.
 */

const MANIFEST_DIGEST_FIELD = '_rxdb_digest';

/** A manifest row for a pulled product, or null when it carries no server digest (id/digest missing). */
export function productManifestRow(document: ProductDocument): ExistenceManifestDocument | null {
	const digest = (document.payload as Record<string, unknown> | undefined)?.[MANIFEST_DIGEST_FIELD];
	if (typeof digest !== 'string' || digest === '' || document.wooProductId == null) {
		return null;
	}
	return existenceManifestDocument({ wooId: document.wooProductId, objectType: 'product', digest });
}

/** The document with `_rxdb_digest` removed from its payload (no-op when absent). */
export function stripProductManifestDigest(document: ProductDocument): ProductDocument {
	const payload = document.payload as Record<string, unknown> | undefined;
	if (!payload || !(MANIFEST_DIGEST_FIELD in payload)) {
		return document;
	}
	const cleaned = { ...payload };
	delete cleaned[MANIFEST_DIGEST_FIELD];
	return { ...document, payload: cleaned as ProductDocument['payload'] };
}

/** Split a pulled batch into the manifest rows to record and the cleaned documents to store. */
export function extractProductManifest(documents: readonly ProductDocument[]): {
	manifestRows: ExistenceManifestDocument[];
	documents: ProductDocument[];
} {
	const manifestRows: ExistenceManifestDocument[] = [];
	const cleaned: ProductDocument[] = [];
	for (const document of documents) {
		const row = productManifestRow(document);
		if (row) {
			manifestRows.push(row);
		}
		cleaned.push(stripProductManifestDigest(document));
	}
	return { manifestRows, documents: cleaned };
}

// --- Customers (ADR 0015, Leg-3 phase 7) -------------------------------------------------------------
// Customers carry `_rxdb_digest` in the payload (stamp_proxy_customer_digests, #348), same as products.
// They populate a SEPARATE manifest collection (existenceManifestCustomers) because the wp_users id-space
// overlaps wp_posts numerically — a shared manifest would collide (ADR 0015 id-space partitioning).

/** A manifest row for a pulled customer, or null when it carries no server digest / no wooId. */
export function customerManifestRow(
	document: LocalCustomerDocument
): ExistenceManifestDocument | null {
	const digest = (document.payload as Record<string, unknown> | undefined)?.[MANIFEST_DIGEST_FIELD];
	if (typeof digest !== 'string' || digest === '' || document.wooCustomerId == null) {
		return null;
	}
	return existenceManifestDocument({
		wooId: document.wooCustomerId,
		objectType: 'customer',
		digest,
	});
}

/** The customer document with `_rxdb_digest` removed from its payload (no-op when absent). */
export function stripCustomerManifestDigest(
	document: LocalCustomerDocument
): LocalCustomerDocument {
	const payload = document.payload as Record<string, unknown> | undefined;
	if (!payload || !(MANIFEST_DIGEST_FIELD in payload)) {
		return document;
	}
	const cleaned = { ...payload };
	delete cleaned[MANIFEST_DIGEST_FIELD];
	return { ...document, payload: cleaned as LocalCustomerDocument['payload'] };
}

/** Split a pulled customer batch into the manifest rows to record and the cleaned documents to store. */
export function extractCustomerManifest(documents: readonly LocalCustomerDocument[]): {
	manifestRows: ExistenceManifestDocument[];
	documents: LocalCustomerDocument[];
} {
	const manifestRows: ExistenceManifestDocument[] = [];
	const cleaned: LocalCustomerDocument[] = [];
	for (const document of documents) {
		// Materialization strips the digest before scheduler repositories see the document,
		// carrying the row out-of-band on the document instead.
		const row = manifestRowOf(document) ?? customerManifestRow(document);
		if (row) {
			manifestRows.push(row);
		}
		cleaned.push(stripCustomerManifestDigest(document));
	}
	return { manifestRows, documents: cleaned };
}

type CustomerUpsertRepository = { upsertMany(documents: LocalCustomerDocument[]): Promise<void> };
type ManifestUpsertCollection = Parameters<typeof upsertManifestRows>[0];

/**
 * Decorate a customer repository so every pull-upsert also seeds the customer existence manifest: extract
 * `_rxdb_digest` → manifest rows, strip it from the stored payload, store the cleaned docs, then upsert
 * the manifest rows AFTER the docs (an abort between leaves a missing manifest row that self-heals, never
 * an orphan). All other repository methods pass through unchanged.
 */
export function withCustomerManifestPopulation<R extends CustomerUpsertRepository>(
	base: R,
	manifestCollection: ManifestUpsertCollection
): R {
	return {
		...base,
		upsertMany: async (documents: LocalCustomerDocument[]) => {
			const { manifestRows, documents: cleaned } = extractCustomerManifest(documents);
			await base.upsertMany(cleaned);
			if (manifestRows.length > 0) {
				await upsertManifestRows(manifestCollection, manifestRows);
			}
		},
	};
}

// --- Orders (ADR 0015, Leg-3 phase 7) ----------------------------------------------------------------
// Orders carry `_rxdb_digest` in the payload (stamp_proxy_order_digests, #356) and populate their OWN
// manifest collection (existenceManifestOrders) — the HPOS/CPT order id-space, again separate to avoid
// numeric collision with wp_posts/wp_users ids.

/** A manifest row for a pulled order, or null when it carries no server digest / no wooOrderId. */
export function orderManifestRow(document: OrderDocument): ExistenceManifestDocument | null {
	const digest = (document.payload as Record<string, unknown> | undefined)?.[MANIFEST_DIGEST_FIELD];
	if (typeof digest !== 'string' || digest === '' || document.wooOrderId == null) {
		return null;
	}
	return existenceManifestDocument({ wooId: document.wooOrderId, objectType: 'order', digest });
}

/** The order document with `_rxdb_digest` removed from its payload (no-op when absent). */
export function stripOrderManifestDigest<T extends OrderDocument>(document: T): T {
	const payload = document.payload as Record<string, unknown> | undefined;
	if (!payload || !(MANIFEST_DIGEST_FIELD in payload)) {
		return document;
	}
	const cleaned = { ...payload };
	delete cleaned[MANIFEST_DIGEST_FIELD];
	return { ...document, payload: cleaned as OrderDocument['payload'] };
}

/** Split a pulled order batch into the manifest rows to record and the cleaned documents to store. */
export function extractOrderManifest<T extends OrderDocument>(
	documents: readonly T[]
): {
	manifestRows: ExistenceManifestDocument[];
	documents: T[];
} {
	const manifestRows: ExistenceManifestDocument[] = [];
	const cleaned: T[] = [];
	for (const document of documents) {
		const row = orderManifestRow(document);
		if (row) {
			manifestRows.push(row);
		}
		cleaned.push(stripOrderManifestDigest(document));
	}
	return { manifestRows, documents: cleaned };
}
