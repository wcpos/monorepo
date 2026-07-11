/**
 * Outcome → replication-action router — the SHARED BRAIN that turns the hybrid
 * engine's detection result (`HybridPollOutcome`, ADR 0005 + the config tier of
 * ADR 0006) into the concrete set of replication actions a host's pull loop
 * executes. The engine DETECTS; this routes; the host APPLIES.
 *
 * Pure module: NO rxdb, NO fetch, NO DOM. It only re-shapes the outcome — every
 * host (web scheduler, playground LabController, the live conformance runner)
 * runs the SAME routing decision through this one function, so "what does a
 * change signal mean for the pull loop" is decided once, in sync-core, behind a
 * locked contract — the same upstream-engine move scopeGuardedPull and the
 * hybrid engine itself made.
 *
 * The routing rules (LOCKED, see ADR 0005/0006 and the change-signal task):
 *   - targetedPulls — changed/missing ids to FETCH, grouped + deduped by
 *     collection. Sourced from non-delete `changes` (TIER 1) and `idsToPull`
 *     whose status is NOT 'deleted' (TIER 3 drill-down). Deletes are excluded:
 *     a tombstone'd id never fetches.
 *   - deletes — tombstones: delete/trash-type `changes` and `idsToPull` with
 *     status 'deleted'. These are LOCAL deletes, never a fetch. A delete WINS
 *     over a pull for the same id (the record is gone; do not re-fetch it).
 *   - reDeriveBarcode / reFetchCollections — the config tier's stale collections
 *     split by whether the snapshot reported `configBarcodeFields` for that
 *     collection: present + non-empty → the host can re-derive its local barcode
 *     index from already-synced docs (try local first); absent/empty → the field
 *     was never synced, so the whole collection must be re-fetched.
 *   - escalations — `escalatedIds` verbatim: the deepest repair signal. SURFACE
 *     / alert these; the host must NEVER auto-loop a pull on them (a stuck record
 *     a pull is not fixing — auto-pulling would just spin).
 *   - nextState — cursor / baselineDigests / configBaseline threaded straight
 *     through so the host persists exactly what the engine advanced.
 */

import type { ConfigFingerprintBaseline } from './configChangeSignal';
import type {
	BarcodeConfigCollection,
	BaselineDigests,
	HybridChange,
	HybridCollection,
	HybridPollOutcome,
	HybridRepairTarget,
	SequenceCursor,
} from './hybridChangeSignal';

export type ReplicationActions = {
	/** changed/missing ids to fetch, grouped + deduped by collection (deletes excluded). */
	targetedPulls: { collection: HybridCollection; ids: number[] }[];
	/** tombstones (delete/trash-type changes + idsToPull status 'deleted') → local delete, NOT a fetch. */
	deletes: { collection: HybridCollection; ids: number[] }[];
	/** staleCollections that reported configBarcodeFields → try local re-derive first. */
	reDeriveBarcode: { collection: BarcodeConfigCollection; activeFields: string[] }[];
	/** staleCollections WITHOUT configBarcodeFields → must re-fetch the whole collection. */
	reFetchCollections: BarcodeConfigCollection[];
	/** escalatedIds — surface/alert, NEVER auto-loop a pull. */
	escalations: HybridRepairTarget[];
	/** What the host persists: exactly what the engine advanced this poll. */
	nextState: {
		cursor: SequenceCursor;
		baselineDigests: BaselineDigests;
		configBaseline?: ConfigFingerprintBaseline;
	};
};

/**
 * A TIER 1 change `type` is a tombstone when its VERB names a delete or trash.
 * The sequence-log emits hooked deletes/trashes as explicit rows (e.g.
 * `product.deleted`, `product.trashed`, `variation.deleted`, `tax_rate.deleted`),
 * NOT as a record quietly vanishing — so we match the verb (the segment after the
 * last `.`) across every collection's `<object>.<verb>` type string.
 *
 * RESTORE verbs that merely CONTAIN delete/trash as a substring are NOT deletes:
 * `product.untrashed` / `product.undeleted` / `product.restored` bring a record
 * BACK, so a naive `includes('trash')` would wrongly tombstone a restore and
 * suppress its pull (codex review). Verbs starting with `un` or containing
 * `restore` are explicitly excluded.
 */
function isDeleteChange(change: HybridChange): boolean {
	const type = change.type.toLowerCase();
	const verb = type.includes('.') ? type.slice(type.lastIndexOf('.') + 1) : type;
	if (verb.startsWith('un') || verb.includes('restore')) {
		return false;
	}
	return verb.includes('delete') || verb.includes('trash');
}

/**
 * Collection-keyed id accumulator that preserves first-seen collection order and
 * dedupes ids within each collection. Collection order follows the order ids are
 * first added, so a host sees a deterministic plan.
 */
class CollectionIdGroups {
	private readonly order: HybridCollection[] = [];
	private readonly byCollection = new Map<HybridCollection, Set<number>>();

	add(collection: HybridCollection, id: number): void {
		let ids = this.byCollection.get(collection);
		if (ids === undefined) {
			ids = new Set<number>();
			this.byCollection.set(collection, ids);
			this.order.push(collection);
		}
		ids.add(id);
	}

	has(collection: HybridCollection, id: number): boolean {
		return this.byCollection.get(collection)?.has(id) ?? false;
	}

	toArray(): { collection: HybridCollection; ids: number[] }[] {
		return this.order.map((collection) => ({
			collection,
			ids: [...(this.byCollection.get(collection) ?? new Set<number>())],
		}));
	}
}

export function planReplicationActions(outcome: HybridPollOutcome): ReplicationActions {
	const pulls = new CollectionIdGroups();
	const deletes = new CollectionIdGroups();

	// First pass — collect deletes so a delete always WINS over a pull for the
	// same (collection, id): a tombstone'd record must not be re-fetched.
	for (const change of outcome.changes) {
		if (isDeleteChange(change)) {
			deletes.add(change.collection, change.id);
		}
	}
	for (const target of outcome.idsToPull) {
		if (target.status === 'deleted') {
			deletes.add(target.collection, target.id);
		}
	}

	// Second pass — non-delete ids become targeted pulls, but skip any id already
	// tombstoned in the same collection.
	const addPull = (collection: HybridCollection, id: number): void => {
		if (!deletes.has(collection, id)) {
			pulls.add(collection, id);
		}
	};
	for (const change of outcome.changes) {
		if (!isDeleteChange(change)) {
			addPull(change.collection, change.id);
		}
	}
	for (const target of outcome.idsToPull) {
		if (target.status !== 'deleted') {
			addPull(target.collection, target.id);
		}
	}

	// Config tier — split stale collections by whether a re-derivable barcode
	// field list was reported for them.
	const reDeriveBarcode: { collection: BarcodeConfigCollection; activeFields: string[] }[] = [];
	const reFetchCollections: BarcodeConfigCollection[] = [];
	for (const collection of outcome.staleCollections ?? []) {
		const activeFields = outcome.configBarcodeFields?.[collection];
		if (activeFields !== undefined && activeFields.length > 0) {
			reDeriveBarcode.push({ collection, activeFields: [...activeFields] });
		} else {
			reFetchCollections.push(collection);
		}
	}

	const nextState: ReplicationActions['nextState'] = {
		cursor: outcome.cursor,
		baselineDigests: outcome.baselineDigests,
		...(outcome.configBaseline !== undefined ? { configBaseline: outcome.configBaseline } : {}),
	};

	return {
		targetedPulls: pulls.toArray(),
		deletes: deletes.toArray(),
		reDeriveBarcode,
		reFetchCollections,
		escalations: outcome.escalatedIds,
		nextState,
	};
}
