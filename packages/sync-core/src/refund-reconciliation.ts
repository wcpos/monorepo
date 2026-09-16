/** Only an explicit parent summary is authoritative; a partial payload is not a deletion. */
export function reconcileRefundIds(summary: unknown, heldIds: readonly number[]) {
	if (!Array.isArray(summary)) return { remove: [], missing: [] };
	const listed = new Set<number>(summary.map((row) => row.id));
	const held = new Set(heldIds);
	return {
		remove: heldIds.filter((id) => !listed.has(id)),
		missing: [...listed].filter((id) => !held.has(id)),
	};
}
