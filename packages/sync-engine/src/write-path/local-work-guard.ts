/**
 * Shared form of EngineOrderRepository's pull boundary guard. Incoming server
 * documents may be applied only when the resident row has no optimistic local
 * work. Both bookkeeping signals are authoritative: `dirty` and a non-empty
 * `pendingMutationIds` list.
 */

type LocalBookkeeping = { dirty?: boolean; pendingMutationIds?: unknown[] };

type StoredDocument = { toJSON(): unknown };

export type LocalWorkCollection = {
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
export async function withoutLocallyProtected<T extends { id: string }>(
	collection: LocalWorkCollection,
	documents: T[]
): Promise<T[]> {
	if (documents.length === 0) return documents;
	const stored = await collection.findByIds(documents.map((document) => document.id)).exec();
	if (stored.size === 0) return documents;
	return documents.filter((document) => !hasPendingLocalWork(stored.get(document.id)?.toJSON()));
}
