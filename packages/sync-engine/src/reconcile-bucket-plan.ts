/**
 * Leg-3 bucket existence reconcile — the pure planning core (ADR 0014 increment 5a).
 *
 * This is the payoff of the whole manifest program: comparing the client's local `{wooId, digest}` set
 * for a bucket against the SERVER's authoritative current `{id, digest}` set for the same id range, it
 * decides — per record — prune / pull / repull. It is what finally removes records that left the server
 * out-of-band (hook-bypass DELETE, CSV re-import to draft, direct-SQL edits, unpublish) which no hook
 * ever reported, and which digest-on-pull alone can never notice because nothing re-pulls a gone record.
 *
 * Pure and side-effect-free: the caller supplies both sides (local from readManifestRange, server from
 * the bucket-list endpoint) and executes the returned plan. The digest is the server's 64-bit value as a
 * STRING (ADR 0014 M1) — compared as strings, never coerced.
 *
 * COLLECTION ROUTING: products and variations share the wp_posts id space, so a bucket holds BOTH. Every
 * action carries its `objectType` so the executor pulls/prunes the right lane — a server-only id in
 * `pull` has no local row to recover its lane from, so it MUST come from the server entry (ADR 0005).
 *
 * DIRTY GUARD: a record with pending local writes (`dirty`) is NEVER pruned OR repulled — both would
 * destroy un-pushed local state. The write path owns dirty records; the reconcile steps around them and
 * surfaces them in `skippedDirty` so the caller can observe (never silently) what it declined to touch.
 */

// Widened for phase 7 (ADR 0015): customers reconcile in their OWN manifest collection + pass, so a
// 'customer' action never mixes with products in a bucket — the id-space partition keeps them separate.
export type ObjectType = 'product' | 'variation' | 'customer' | 'order';

export type LocalManifestEntry = {
	wooId: number;
	digest: string;
	objectType: ObjectType;
	/** Pending local writes not yet pushed — protected from prune AND repull. */
	dirty?: boolean;
};

export type ServerDigestEntry = { id: number; digest: string; objectType: ObjectType };

/** An action target — the id plus the lane it must be executed against. */
export type ReconcileAction = { wooId: number; objectType: ObjectType };

export type ReconcilePlan = {
	/** Local, absent from the server's authoritative set, not dirty → stale; remove the record + its manifest row. */
	prune: ReconcileAction[];
	/** On the server, absent locally → missing; pull it (lane from the SERVER entry). */
	pull: ReconcileAction[];
	/** Present both sides but the digest differs → changed (incl. hook-bypass); re-pull. */
	repull: ReconcileAction[];
	/** Dirty local records an action WOULD have touched (prune/repull), suppressed by the dirty guard. */
	skippedDirty: ReconcileAction[];
};

export function reconcileBucketPlan(
	local: readonly LocalManifestEntry[],
	server: readonly ServerDigestEntry[]
): ReconcilePlan {
	const serverById = new Map<number, ServerDigestEntry>();
	for (const entry of server) {
		serverById.set(entry.id, entry);
	}

	const localIds = new Set<number>();
	const prune: ReconcileAction[] = [];
	const repull: ReconcileAction[] = [];
	const skippedDirty: ReconcileAction[] = [];

	for (const entry of local) {
		localIds.add(entry.wooId);
		const action: ReconcileAction = { wooId: entry.wooId, objectType: entry.objectType };
		const serverEntry = serverById.get(entry.wooId);
		const wouldAct = serverEntry === undefined || serverEntry.digest !== entry.digest;

		if (entry.dirty) {
			// Pending local writes — the write path owns this record; never prune or repull it.
			if (wouldAct) {
				skippedDirty.push(action);
			}
			continue;
		}

		if (serverEntry === undefined) {
			prune.push(action); // gone from the server's set → stale
		} else if (serverEntry.digest !== entry.digest) {
			repull.push(action); // changed out-of-band
		}
		// else: digests match → in sync, no action
	}

	const pull: ReconcileAction[] = [];
	for (const entry of server) {
		if (!localIds.has(entry.id)) {
			pull.push({ wooId: entry.id, objectType: entry.objectType }); // lane from the server — no local row exists
		}
	}

	return { prune, pull, repull, skippedDirty };
}
