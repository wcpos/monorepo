/**
 * Outcome → replication-action router — the SHARED BRAIN that turns the hybrid
 * engine's detection result (`HybridPollOutcome`, ADR 0005 + the config tier of
 * ADR 0006) into the concrete set of replication actions a host's pull loop
 * executes. The engine DETECTS; this routes; the host APPLIES.
 *
 * Pure module: NO rxdb, NO fetch, NO DOM. It only re-shapes the outcome — every
 * host (the engine scheduler, the live conformance runner)
 * runs the SAME routing decision through this one function, so "what does a
 * change signal mean for the pull loop" is decided once, in sync-core, behind a
 * locked contract shared by the hybrid engine and its host adapters.
 *
 * The routing rules (LOCKED, see ADR 0005/0006 and the change-signal task):
 *   - targetedPulls — changed/missing ids to FETCH, grouped + deduped by
 *     collection. Sourced from non-delete `changes` (TIER 1) and `idsToPull`
 *     whose status is NOT 'deleted' (TIER 3 drill-down). Deletes are excluded:
 *     a tombstone'd id never fetches.
 *   - deletes — tombstones: delete/trash-type `changes` and `idsToPull` with
 *     status 'deleted'. These are LOCAL deletes, never a fetch. A delete WINS
 *     over a pull for the same id (the record is gone; do not re-fetch it) —
 *     but `changes` is first collapsed to ONE net event per (collection, id),
 *     because the catalogue lane serves raw event rows and the last event in
 *     sequence order is the record's current state, not the harshest one.
 *   - reDeriveBarcode / reFetchCollections — the config tier's stale collections
 *     split by whether the snapshot reported `configBarcodeFields` for that
 *     collection: present + non-empty → the host can re-derive its local barcode
 *     index from already-synced docs (try local first); absent/empty → the field
 *     was never synced, so the whole collection must be re-fetched.
 *   - escalations — `escalatedIds` verbatim: the deepest repair signal. SURFACE
 *     / alert these; the host must NEVER auto-loop a pull on them (a stuck record
 *     a pull is not fixing — auto-pulling would just spin).
 *   - escalationClears — complete-sweep cure evidence, surfaced verbatim.
 *   - nextState — cursor / baselines / escalation ledger threaded straight through
 *     so the host persists exactly what the engine advanced.
 */

import type { ConfigFingerprintBaseline } from './configChangeSignal';
import type {
	BarcodeConfigCollection,
	BaselineDigests,
	HybridCollection,
	HybridPollOutcome,
	HybridRepairTarget,
	SequenceCursor,
} from './hybridChangeSignal';

export type ReplicationActions = {
	/** changed/missing ids to fetch, grouped + deduped by collection (deletes excluded). */
	targetedPulls: { collection: HybridCollection; ids: number[] }[];
	/** tombstones (deleted changes + idsToPull status 'deleted') → local delete, NOT a fetch. */
	deletes: { collection: HybridCollection; ids: number[] }[];
	/** All collections to refresh after abandoning an excessive sequence-log replay. */
	rebaselineCollections: HybridCollection[];
	/** staleCollections that reported configBarcodeFields → try local re-derive first. */
	reDeriveBarcode: { collection: BarcodeConfigCollection; activeFields: string[] }[];
	/** staleCollections WITHOUT configBarcodeFields → must re-fetch the whole collection. */
	reFetchCollections: BarcodeConfigCollection[];
	/** escalatedIds — surface/alert, NEVER auto-loop a pull. */
	escalations: HybridRepairTarget[];
	/** Previously escalated ids verified matching by a complete sweep. */
	escalationClears: HybridRepairTarget[];
	/** What the host persists: exactly what the engine advanced this poll. */
	nextState: {
		cursor: SequenceCursor;
		baselineDigests: BaselineDigests;
		escalations: HybridRepairTarget[];
		configBaseline?: ConfigFingerprintBaseline;
		epoch?: string;
	};
};

const REBASELINE_COLLECTIONS: readonly HybridCollection[] = [
	'products',
	'variations',
	'customers',
	'tax_rates',
	'categories',
	'brands',
	'tags',
	'coupons',
];

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

	// The catalogue lane serves RAW journal event rows — only the order lane is
	// coalesced server-side — so one drain can carry delete-then-restore for the
	// same record (trash then untrash inside a poll window). `changes` arrives in
	// ascending sequence order, so the LAST event for an id is its net state:
	// collapse to it before routing, or an "any delete wins" rule would leave a
	// restored record locally deleted until the next integrity sweep repaired it
	// (free#1560 review, blocker B5).
	const netChanges = new Map<string, (typeof outcome.changes)[number]>();
	for (const change of outcome.changes) {
		netChanges.set(`${change.collection}:${change.id}`, change);
	}

	// First pass — collect deletes so a delete WINS over a pull for the same
	// (collection, id): a tombstone'd record must not be re-fetched. Across the
	// two SOURCES the tombstone still wins outright: the TIER 2/3 sweep runs
	// AFTER the drain, so its 'deleted' verdict is the newer observation.
	for (const change of netChanges.values()) {
		if (change.deleted) {
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
	for (const change of netChanges.values()) {
		if (!change.deleted) {
			addPull(change.collection, change.id);
		}
	}
	for (const target of outcome.idsToPull) {
		if (target.status !== 'deleted') {
			addPull(target.collection, target.id);
		}
	}

	/**
	 * A stale collection is repaired whenever the server DESCRIBED its barcode carriers — even when
	 * that description is an empty list.
	 *
	 * The distinction is `undefined` vs `[]`, and it is load-bearing:
	 *
	 *  - `undefined` — the server sent no `barcode_fields` envelope at all (an old plugin, or a
	 *    stripped response). We cannot reason about what the client holds, and re-ingesting a
	 *    payload with no selectors drops any `payload.barcode` a previous session materialized. Such
	 *    a plugin also cannot announce a payload-contract change, so there is nothing to migrate.
	 *    Skipping is the conservative and correct choice, and it is what the original gate was
	 *    protecting.
	 *  - `[]` — the server explicitly says this store has NO derivable barcode carrier. Nothing was
	 *    materialized to lose; and if the setting just moved to a carrier this WooCommerce cannot
	 *    serve, the stale local value is wrong anyway. Repairing is safe.
	 *
	 * The old gate collapsed those two into "non-empty", which made the second case a PERMANENT
	 * skip: the plugin reports no barcode fields for the DEFAULT `_global_unique_id` setting on
	 * WooCommerce below 9.2 (wc/v3 does not serve that field before then), and `nextState.configBaseline`
	 * below advances unconditionally whether or not a repair ran. So such a store observed a
	 * fingerprint move once, re-fetched nothing, recorded the new baseline, and never retried.
	 *
	 * That silently broke the migration path for a plugin payload-SHAPE change (the plugin's
	 * `payload_contract` bump) on every WC 5.3–9.1 store using the default barcode field. A shape
	 * change is precisely the case a client cannot self-repair: it can be taught to read two image
	 * shapes, but a variation name the server collapsed is indistinguishable from a correct one.
	 *
	 * `reFetchCollection()` is a no-op for anything that is not products/variations, and
	 * applyReplicationActions skips `tax_rates` here because step 4 already refreshed it.
	 */
	const reDeriveBarcode: { collection: BarcodeConfigCollection; activeFields: string[] }[] = [];
	const reFetchCollections: BarcodeConfigCollection[] =
		outcome.configBarcodeFields === undefined ? [] : [...(outcome.staleCollections ?? [])];

	const nextState: ReplicationActions['nextState'] = {
		cursor: outcome.cursor,
		baselineDigests: outcome.baselineDigests,
		escalations: outcome.escalationLedger,
		...(outcome.configBaseline !== undefined ? { configBaseline: outcome.configBaseline } : {}),
		...(outcome.epoch !== undefined ? { epoch: outcome.epoch } : {}),
	};

	return {
		targetedPulls: pulls.toArray(),
		deletes: deletes.toArray(),
		rebaselineCollections: outcome.rebaseline ? [...REBASELINE_COLLECTIONS] : [],
		reDeriveBarcode,
		reFetchCollections,
		escalations: outcome.escalatedIds,
		escalationClears: outcome.clearedEscalations,
		nextState,
	};
}
