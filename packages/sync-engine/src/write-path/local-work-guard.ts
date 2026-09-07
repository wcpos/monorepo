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

/** Only skip proven equality; uncertainty deliberately costs another write. */
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
			const incoming: Record<string, unknown> = { ...document };
			const schema = collection.schema;
			// Current RxDB exposes defaultValues; older collections expose the fill method.
			if (schema?.fillObjectWithDefaults) {
				return !deepEqual(json, schema.fillObjectWithDefaults(incoming));
			}
			if (schema && !schema.defaultValues) return true;
			for (const [key, value] of Object.entries(schema?.defaultValues ?? {})) {
				if (incoming[key] === undefined) incoming[key] = value;
			}
			// Full equality also rejects stored extra keys when there is no schema.
			return !deepEqual(json, incoming);
		} catch {
			return true;
		}
	});
}
