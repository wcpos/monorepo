/**
 * The barcode carriers a STORE SCOPE materializes by — scope-owned state, not
 * process state.
 *
 * Which payload field carries a scannable code is the site's representation
 * config (ADR 0006: `sku`, `global_unique_id`, or a `meta_data:` key), read
 * once per scope at open (`hydrateBarcodeSelectors`) and refreshed on every
 * config-fingerprint poll. Two scopes may legitimately disagree, so the
 * selectors ride the scope: hydration writes them on ITS scope, and
 * materialization derives `payload.barcode` from the scope it was invoked with.
 * Nothing is shared between scopes and nothing has to be reset between them.
 *
 * `[]` means "no carriers known for this scope" — either the scope has not
 * hydrated yet or the server reported none. It is the deliberate safe reading:
 * no `barcode` field is materialized, so a scan misses locally and falls back
 * to the online resolve rather than matching on a guessed field.
 *
 * A `BarcodeSelectors` value is an IMMUTABLE SNAPSHOT: `publish()` swaps the
 * object rather than mutating it, so a snapshot captured before an `await` goes
 * stale the moment a concurrent config poll resolves a new carrier. Anything
 * that spans awaits (a lane tick, a multi-page drain, a queue drain) therefore
 * holds a `BarcodeSelectorsReader` and calls it at the point of use; only
 * synchronous leaf consumers (`materializeTargeted`, `mapBarcodeEditToPayload`)
 * take the value itself.
 */
import type {
	BarcodeConfigCollection,
	BarcodeMaterializedCollection,
	ConfigFingerprintSnapshot,
} from '@wcpos/sync-core';

/** Only these two collections materialize a barcode. */
export const BARCODE_MATERIALIZED_COLLECTIONS: readonly BarcodeMaterializedCollection[] = [
	'products',
	'variations',
];

/** One scope's active carriers, per materialized collection. */
export type BarcodeSelectors = Readonly<Record<BarcodeMaterializedCollection, readonly string[]>>;

/** No carriers known — see the module header. */
export const NO_BARCODE_SELECTORS: BarcodeSelectors = Object.freeze({
	products: Object.freeze([]) as readonly string[],
	variations: Object.freeze([]) as readonly string[],
});

/**
 * A LIVE read of one scope's carriers. Hold this — never the value it returns —
 * across an await: the carriers a lane started with are not necessarily the ones
 * in force when its later rows are written. `undefined` = no scope to read.
 */
export type BarcodeSelectorsReader = () => BarcodeSelectors | undefined;

/**
 * Reads one collection's carriers out of a scope's selectors, answering `[]` for
 * every collection that has no barcode facet (customers, orders, references) —
 * so a generic call site can hand its collection name straight through.
 */
export function barcodeSelectorsFor(
	selectors: BarcodeSelectors | undefined,
	collection: string
): readonly string[] {
	return collection === 'products' || collection === 'variations'
		? (selectors?.[collection] ?? [])
		: [];
}

export type ScopeBarcodeSelectors = {
	/** This scope's carriers right now. */
	current(): BarcodeSelectors;
	/** Publish the carriers a config-fingerprint read resolved for one collection. */
	publish(collection: BarcodeMaterializedCollection, selectors: readonly string[]): void;
	/**
	 * A scope-open hydration attempt is STARTING: drop whatever a previous attempt
	 * resolved. Open-time hydration retries whenever the scope has not bootstrapped
	 * (a failed bootstrap seed leaves it un-bootstrapped), so without this a first
	 * attempt's carriers would outlive a later attempt that FAILED — and if the
	 * site's barcode setting changed in between, every record materialized after
	 * that would use the wrong carrier with nothing to correct it. Clearing first
	 * keeps the failure mode the documented one: no carriers, online fallback.
	 */
	beginHydrationAttempt(): void;
	/**
	 * The scope's OPEN-TIME hydration failed, so the documents bootstrap seeded
	 * (and anything pulled before the first successful config poll) were
	 * materialized with no carriers and carry no `barcode`. Sticky until the
	 * recovery below has actually re-pulled them.
	 */
	noteHydrationFailed(): void;
	/**
	 * The recovery. Once carriers DO arrive for a scope whose open-time hydration
	 * failed, the config fingerprint itself has not moved — it is this client's
	 * first sighting, which the config signal would silently adopt as its
	 * baseline — so nothing would re-pull the barcode-less documents. Naming the
	 * collections here forces them down the signal's normal stale path, and the
	 * re-pull re-materializes them with the carriers now in hand.
	 *
	 * Returns the collections the snapshot reports carriers for; empty once the
	 * recovery has completed (or when hydration never failed).
	 */
	staleCollectionsForRecovery(
		snapshot: ConfigFingerprintSnapshot
	): readonly BarcodeConfigCollection[];
	/**
	 * The tick that carried a forced re-pull PERSISTED its state. Only now is the
	 * recovery spent: a tick that threw before persisting has not re-pulled
	 * anything, so the miss must survive and force the collections again.
	 */
	noteRecoveryPersisted(): void;
};

export function createScopeBarcodeSelectors(): ScopeBarcodeSelectors {
	let selectors: BarcodeSelectors = NO_BARCODE_SELECTORS;
	let hydrationFailed = false;
	let recoveryInFlight = false;

	return {
		current: () => selectors,
		publish(collection, next) {
			selectors = { ...selectors, [collection]: [...next] };
		},
		beginHydrationAttempt() {
			selectors = NO_BARCODE_SELECTORS;
			// `hydrationFailed` deliberately survives: an EARLIER attempt may already
			// have seeded barcode-less documents, and only the recovery re-pull —
			// not a later successful hydration — repairs those.
		},
		noteHydrationFailed() {
			hydrationFailed = true;
		},
		staleCollectionsForRecovery(snapshot) {
			recoveryInFlight = false;
			if (!hydrationFailed) return [];
			const stale = BARCODE_MATERIALIZED_COLLECTIONS.filter(
				(collection) => (snapshot.barcodeFields?.[collection]?.length ?? 0) > 0
			);
			if (stale.length > 0) recoveryInFlight = true;
			return stale;
		},
		noteRecoveryPersisted() {
			if (!recoveryInFlight) return;
			recoveryInFlight = false;
			hydrationFailed = false;
		},
	};
}
