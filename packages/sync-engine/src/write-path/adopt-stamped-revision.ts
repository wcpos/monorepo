/**
 * #423 step 1b: adopt the proxy-stamped CANONICAL revision. The server stamps
 * `_rxdb_revision` (computed over the bare payload, before uuid/digest
 * augmentation) on every proxied record; lane builders read it into
 * `sync.revision` and STRIP it from the stored payload (transport metadata —
 * left in the payload it would perturb any future payload hashing). The
 * legacy synthesis stays as the transitional fallback for un-upgraded
 * servers; the write path's grace comparer bridges those until retirement.
 */
export function adoptStampedRevision<T extends Record<string, unknown>>(
	payload: T,
	synthesize: () => string
): { revision: string; payload: T } {
	const stamped = (payload as { _rxdb_revision?: unknown })._rxdb_revision;
	// Strip unconditionally: even an invalid stamp (wrong type / empty) is
	// transport metadata and must never reach the stored payload.
	const { _rxdb_revision: _stamp, ...rest } = payload as Record<string, unknown>;
	if (typeof stamped === 'string' && stamped !== '') {
		return { revision: stamped, payload: rest as T };
	}
	return { revision: synthesize(), payload: rest as T };
}
