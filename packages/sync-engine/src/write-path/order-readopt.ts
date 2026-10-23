/**
 * Orders a corrective refresh re-adopts even when the server's stamp equals the resident's
 * (ADR 0040 §1.3). A naked revision write (the 428 refresh, a manual rebase, a non-adopting
 * ack) can leave the resident stamped with the very revision the server serves; the pull's
 * equal-stamp skip would then keep the stale payload under it. Keyed by the scope database and
 * held only while the refresh that asked for it drains; the local-work guard still applies.
 */
const requested = new WeakMap<object, Map<string, number>>();

export async function withOrderReadopt<T>(
	database: object,
	remoteIds: readonly string[],
	work: () => Promise<T>
): Promise<T> {
	const ids = requested.get(database) ?? new Map<string, number>();
	requested.set(database, ids);
	for (const id of remoteIds) ids.set(id, (ids.get(id) ?? 0) + 1);
	try {
		return await work();
	} finally {
		for (const id of remoteIds) {
			const left = (ids.get(id) ?? 1) - 1;
			if (left > 0) ids.set(id, left);
			else ids.delete(id);
		}
	}
}

export function readoptRequested(database: object, remoteId: unknown): boolean {
	return typeof remoteId === 'string' && (requested.get(database)?.has(remoteId) ?? false);
}
