import { deepEqual } from 'rxdb/plugins/utils';

/**
 * Shared form of EngineOrderRepository's pull boundary guard. Incoming server
 * documents may be applied only when the resident row has no optimistic local
 * work. Both bookkeeping signals are authoritative: `dirty` and a non-empty
 * `pendingMutationIds` list.
 */

type LocalBookkeeping = { dirty?: boolean; pendingMutationIds?: unknown[] };

type StoredDocument = { toJSON(withMetaFields?: boolean): unknown };

export type LocalWorkCollection = {
	schema?: {
		fillObjectWithDefaults?: (document: Record<string, unknown>) => unknown;
		defaultValues?: Record<string, unknown>;
	};
	findByIds(ids: string[]): { exec(): Promise<Map<string, StoredDocument>> };
};

export function hasPendingLocalWork(document: unknown): boolean {
	const local = (document as { local?: LocalBookkeeping } | null)?.local;
	return (
		local?.dirty === true ||
		(Array.isArray(local?.pendingMutationIds) && local.pendingMutationIds.length > 0)
	);
}

/** Drop pulled server rows whose resident counterpart still owns local work. */
export async function withoutLocallyProtected<T extends { uuid: string }>(
	collection: LocalWorkCollection,
	documents: T[],
	residents?: Map<string, StoredDocument>
): Promise<T[]> {
	if (documents.length === 0) return documents;
	const stored =
		residents ?? (await collection.findByIds(documents.map((document) => document.uuid)).exec());
	if (stored.size === 0) return documents;
	return documents.filter((document) => !hasPendingLocalWork(stored.get(document.uuid)?.toJSON()));
}

/**
 * The server's canonical content revision, when the record carries one. The plugin's
 * `Sync\Revision` stamps `sha256:<hex>` over a CANONICALIZED wc/v3 serialization: volatile
 * derived fields dropped (`related_ids` comes back shuffled on every GET, `_links` is
 * request-derived), keys sorted recursively, taxonomy arrays sorted as sets. A legacy lane
 * synthesizes a date/id stand-in instead (adopt-stamped-revision.ts), which must never be
 * mistaken for a content hash — so only a `sha256:` value counts here.
 */
function stampedRevision(document: unknown): string | null {
	const revision = (document as { sync?: { revision?: unknown } } | null)?.sync?.revision;
	return typeof revision === 'string' && revision.startsWith('sha256:') ? revision : null;
}

function withoutPayload(document: Record<string, unknown>): Record<string, unknown> {
	const { payload: _payload, ...rest } = document;
	return rest;
}

/**
 * Only skip proven equality; uncertainty deliberately costs another write.
 *
 * Payload equality is the SERVER's call when both sides carry its stamped revision: the stamp
 * is computed over the canonical form, so a byte-different payload under an equal stamp is the
 * same content by definition (measured 2026-10-12: `related_ids` arrives in a different order
 * on every pull, and comparing bytes here rewrote 10–15 of 71 unchanged products per sync, each
 * rewrite minting a new RxDocument and re-rendering its tile). The client's own derivations —
 * promoted columns, the barcode from the current selectors, `remoteId`, `sync`, `local` — are
 * still compared byte for byte, so a changed selector or a skeleton filling in still writes.
 * Without two stamps (an un-upgraded server), the whole document is compared as before.
 */
export function withoutUnchanged<T extends { uuid: string }>(
	collection: LocalWorkCollection,
	stored: Map<string, StoredDocument>,
	documents: T[]
): T[] {
	return documents.filter((document) => {
		try {
			const resident = stored.get(document.uuid)?.toJSON(true);
			if (!resident || typeof resident !== 'object') return true;
			const json = { ...resident } as Record<string, unknown>;
			if (json._deleted) return true;
			for (const key of ['_rev', '_meta', '_attachments', '_deleted']) delete json[key];
			const incoming = filledWithDefaults(collection, { ...document });
			if (incoming === null) return true;
			const storedStamp = stampedRevision(json);
			if (storedStamp !== null && storedStamp === stampedRevision(incoming)) {
				return !deepEqual(withoutPayload(json), withoutPayload(incoming));
			}
			// Full equality also rejects stored extra keys when there is no schema.
			return !deepEqual(json, incoming);
		} catch {
			return true;
		}
	});
}

/**
 * THE pull-apply boundary, shared by every lane that lands server rows (the scheduler drain and
 * the change-signal handlers): `applicable` are the rows no resident local work protects — server
 * truth is resident for all of them, written or not — and `changed` are the ones among them whose
 * bytes actually move. One `findByIds` serves both filters.
 */
export async function partitionPulledRows<T extends { uuid: string }>(
	collection: LocalWorkCollection,
	documents: T[]
): Promise<{ applicable: T[]; changed: T[] }> {
	if (documents.length === 0) return { applicable: documents, changed: documents };
	const stored = await collection.findByIds(documents.map((document) => document.uuid)).exec();
	const applicable = await withoutLocallyProtected(collection, documents, stored);
	return { applicable, changed: withoutUnchanged(collection, stored, applicable) };
}

/** The incoming document as RxDB would store it, or null when that cannot be known. */
function filledWithDefaults(
	collection: LocalWorkCollection,
	incoming: Record<string, unknown>
): Record<string, unknown> | null {
	const schema = collection.schema;
	// Current RxDB exposes defaultValues; older collections expose the fill method.
	if (schema?.fillObjectWithDefaults) {
		return schema.fillObjectWithDefaults(incoming) as Record<string, unknown>;
	}
	if (schema && !schema.defaultValues) return null;
	for (const [key, value] of Object.entries(schema?.defaultValues ?? {})) {
		if (incoming[key] === undefined) incoming[key] = value;
	}
	return incoming;
}
