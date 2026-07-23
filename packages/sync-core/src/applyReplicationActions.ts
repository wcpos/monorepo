/**
 * The apply decision tree — the SINGLE place a routed `ReplicationActions` plan
 * (from `planReplicationActions`) is turned into concrete replication work. The
 * engine DETECTS, `planReplicationActions` ROUTES, and THIS module APPLIES, the
 * same upstream-into-sync-core move the hybrid engine and `scopeGuardedPull`
 * made.
 *
 * Before this module, the "apply" tree was re-implemented on two hosts and they
 * DRIFTED: the web tick handled tax-rate updates/deletes and barcode re-derive;
 * the playground tick handled product pulls/deletes ONLY (tax rates unhandled,
 * barcode re-derive absent). Lifting the tree here and making BOTH hosts thin
 * adapters fixes the drift permanently — and the handler interface is fully
 * REQUIRED, so a host that forgets an arm fails to compile rather than silently
 * dropping a detected change.
 *
 * Pure module: NO rxdb, NO fetch, NO DOM, NO timers. Every side effect is an
 * injected handler; the only sync-core logic it reaches for is the pure
 * `rebuildBarcodeIndexForConfig` (ADR 0006). The applier owns:
 *   - the collection split (products / variations / tax_rates);
 *   - product pull + delete, surfacing a scope-guarded shortfall (a handler that
 *     applied FEWER ids than requested — the engine cursor already advanced in
 *     memory on poll(), so an unapplied change must be surfaced, never silently
 *     consumed; PR #195);
 *   - tax-rate refresh (UPDATE/ADD or a config-stale tax_rates collection) and
 *     tax-rate tombstone delete (the upsert-only refresh never prunes);
 *   - barcode re-derive → apply, else re-fetch fallback (ADR 0006);
 *   - variation pull + delete (parent-mediated, via the host's lab variations lane);
 *   - the ADR-0005 commit-only-on-success invariant: `persistState` runs LAST,
 *     only after every handler above resolved — a thrown handler aborts the tick
 *     and the cursor/baselines are NOT persisted, so the next poll re-drains.
 */

import { type SyncEvent, type SyncObserver } from './telemetry';
import { rebuildBarcodeIndexForConfig, type RebuildBarcodeIndexResult } from './barcodeResolve';
import {
	type HybridCollection,
	type HybridRepairTarget,
	REFERENCE_COLLECTIONS,
	type ReferenceCollection,
} from './hybridChangeSignal';

import type { ReplicationActions } from './changeSignalReplication';

/** An already-synced document the barcode re-derive reads (id + payload only). */
export type SyncedDocument = { id: string; payload: Record<string, unknown> };

/**
 * The thin host adapter surface. EVERY handler is required: omitting one is a
 * compile error, which is what makes "forget to handle an arm" (the original
 * playground drift) impossible. Handlers may be sync or async; the applier
 * `await`s each. A handler that THROWS aborts the tick before `persistState`.
 */
export type ReplicationActionHandlers = {
	/**
	 * Fetch + apply the given PRODUCT ids (the host's targeted-pull lane). Returns
	 * how many were APPLIED (web: durably seeded == accepted; playground: actually
	 * written). A return value < `ids.length` means the host could not apply some
	 * (e.g. a mid-tick scope switch dropped a guarded write) and the applier
	 * SURFACES the shortfall — the engine cursor has already advanced past them.
	 */
	pullProducts(ids: number[]): Promise<number> | number;
	/** Delete local PRODUCT docs by Woo id (tombstones; never a fetch). Returns the count applied. */
	deleteProducts(ids: number[]): Promise<number> | number;
	/**
	 * Fetch + apply the given VARIATION ids. Variations are NOT fetchable via wc/v3
	 * `products?include=` (a separate, parent-mediated resource), so the host pulls
	 * them through the versioned `{syncBase}/variations` endpoint, which resolves the
	 * parent server-side. Returns how many were applied; a return < `ids.length`
	 * surfaces a shortfall exactly like `pullProducts`.
	 */
	pullVariations(ids: number[]): Promise<number> | number;
	/** Delete local VARIATION docs by Woo id (tombstones; never a fetch). Returns the count applied. */
	deleteVariations(ids: number[]): Promise<number> | number;
	/**
	 * Fetch + apply the given CUSTOMER ids (the host's targeted customer-pull lane).
	 * Customers are change-detected via the sequence-log (they are wp_users, so they
	 * carry NO barcode config and are NOT in the wp_posts integrity sweep). Returns
	 * how many were applied; a return < `ids.length` surfaces a shortfall exactly
	 * like `pullProducts`.
	 */
	pullCustomers(ids: number[]): Promise<number> | number;
	/** Delete local CUSTOMER docs by Woo id (tombstones; never a fetch). Returns the count applied. */
	deleteCustomers(ids: number[]): Promise<number> | number;
	/**
	 * Full-refresh the tax_rates collection (the upsert lane). Invoked for a
	 * tax-rate UPDATE/ADD or a config-stale tax_rates collection.
	 */
	refreshTaxRates(): Promise<void> | void;
	/** Delete local tax-rate docs by Woo id (tombstones; the refresh only upserts, never prunes). Returns the count applied. */
	deleteTaxRates(ids: number[]): Promise<number> | number;
	/**
	 * Full-refresh one GREEDY reference collection (coupons / categories / brands / tags)
	 * by re-seeding its `<collection>:all` pull-only lane. Invoked for ANY change to that
	 * collection — create, update, OR delete — because the greedy fetcher is PRUNABLE
	 * (set-difference deletion): one re-pull upserts current rows AND prunes a deleted
	 * one. So there is no per-id pull and no separate delete handler for these (unlike
	 * products/customers, and unlike tax rates whose lane only upserts).
	 */
	refreshReferenceCollection(collection: ReferenceCollection): Promise<void> | void;
	/**
	 * Read already-synced docs for a stale collection, driving the local barcode
	 * re-derive. A host that cannot re-derive a given collection (e.g. it has no
	 * local store for it) returns `[]`, which routes that collection to the
	 * re-fetch fallback instead of re-deriving from the wrong collection's docs.
	 */
	loadSyncedDocs(collection: HybridCollection): Promise<SyncedDocument[]> | SyncedDocument[];
	/**
	 * Apply a locally re-derived barcode index for a collection (so scans use the
	 * NEW mapping). Returns whether it was APPLIED — a host may DECLINE (return
	 * false), e.g. a scope-guarded write dropped after a mid-tick scope switch, in
	 * which case the applier surfaces the unapplied re-derive rather than reporting
	 * a false success.
	 */
	applyBarcodeIndex(
		collection: HybridCollection,
		index: RebuildBarcodeIndexResult
	): Promise<boolean> | boolean;
	/**
	 * Re-fetch a whole collection when local re-derivation is impossible (the
	 * active barcode field was never synced) or the stale collection reported no
	 * barcode field at all. Returns how many ids were re-fetched (for the log).
	 */
	reFetchCollection(collection: HybridCollection): Promise<number> | number;
	/**
	 * Persist the engine's advanced state. Called ONLY after every handler above
	 * succeeded — the ADR-0005 commit-only-on-success invariant. A host whose
	 * engine holds its cursor purely in memory (the playground) may pass a no-op.
	 */
	persistState(state: ReplicationActions['nextState']): Promise<void> | void;
	/** Surface a log line (escalations, deferrals, shortfalls, re-derive notes). */
	log(line: string): void;
	/**
	 * Optional structured telemetry seam. Each apply arm emits one `SyncEvent`
	 * (`apply.pull` / `apply.delete` / `apply.refresh` / `apply.refetch` /
	 * `apply.barcode-rederive` / `apply.escalation`) with the `collection` and a
	 * `{ requested, applied }` (or `{ refetched }` / `{ id, status, detector }`)
	 * field payload — `warn` level on a shortfall. Feeds the metrics + logging
	 * spine; omit it (or pass `undefined`) for no telemetry.
	 */
	observe?: SyncObserver;
};

/** Per stale collection: whether the barcode index was re-derived locally (true) or fell back to re-fetch (false). */
export type ReDeriveResult = { collection: HybridCollection; rederived: boolean };

/**
 * The single applier return type, reconciling the web tick's
 * `ChangeSignalReplicationTickResult` and the playground's
 * `ChangeSignalTickOutcome`. Hosts expose this directly (the web tick) or extend
 * it with a host concern (the playground adds `ran`).
 */
export type ApplyReplicationActionsResult = {
	/** PRODUCT ids routed to a targeted pull this tick (deduped, sorted). */
	targetedProductIds: number[];
	/** PRODUCT docs actually applied by the pull. < `targetedProductIds.length` ⇒ a dropped/short pull (surfaced). */
	appliedProductCount: number;
	/** PRODUCT ids routed to a local delete (tombstones). */
	deletedProductIds: number[];
	/** PRODUCT tombstones actually applied. < `deletedProductIds.length` ⇒ a dropped delete (surfaced). */
	appliedDeleteCount: number;
	/** VARIATION ids routed to a targeted pull this tick (deduped, sorted). */
	targetedVariationIds: number[];
	/** VARIATION docs actually applied by the pull. < `targetedVariationIds.length` ⇒ a dropped/short pull (surfaced). */
	appliedVariationCount: number;
	/** VARIATION ids routed to a local delete (tombstones). */
	variationDeleteIds: number[];
	/** VARIATION tombstones actually applied. */
	appliedVariationDeleteCount: number;
	/** CUSTOMER ids routed to a targeted pull this tick (deduped, sorted). */
	targetedCustomerIds: number[];
	/** CUSTOMER docs actually applied by the pull. < `targetedCustomerIds.length` ⇒ a dropped/short pull (surfaced). */
	appliedCustomerCount: number;
	/** CUSTOMER ids routed to a local delete (tombstones). */
	customerDeleteIds: number[];
	/** CUSTOMER tombstones actually applied. */
	appliedCustomerDeleteCount: number;
	/** Whether a tax-rate UPDATE/ADD (or config-stale tax_rates) fired the full refresh. */
	taxRatesRefreshed: boolean;
	/** The greedy reference collections whose `<collection>:all` lane was re-seeded this tick (any change fires it). */
	refreshedReferenceCollections: ReferenceCollection[];
	/** Tax-rate ids routed to a local delete (tombstones). */
	taxRateDeleteIds: number[];
	/** Tax-rate tombstones actually applied. */
	appliedTaxRateDeleteCount: number;
	/** Per stale collection: re-derived locally (true) or fell back to re-fetch (false). */
	reDerived: ReDeriveResult[];
	/** Escalations surfaced this tick (logged, NEVER auto-pulled). */
	escalations: HybridRepairTarget[];
	/** Whether `persistState` ran (always true on a non-throwing tick). */
	persisted: boolean;
	/** The routed plan, for callers that want the raw actions. */
	actions: ReplicationActions;
};

/**
 * The all-zero applier result: what a tick that never ran (engine off / no
 * change-signal source) reports. Owned here, next to the type, so every host
 * that needs the "nothing happened" shape shares ONE literal — a field added to
 * `ApplyReplicationActionsResult` is added to its empty form in the same file,
 * instead of drifting in a hand-maintained host copy.
 */
export function emptyApplyReplicationActionsResult(): ApplyReplicationActionsResult {
	return {
		targetedProductIds: [],
		appliedProductCount: 0,
		deletedProductIds: [],
		appliedDeleteCount: 0,
		targetedVariationIds: [],
		appliedVariationCount: 0,
		variationDeleteIds: [],
		appliedVariationDeleteCount: 0,
		targetedCustomerIds: [],
		appliedCustomerCount: 0,
		customerDeleteIds: [],
		appliedCustomerDeleteCount: 0,
		taxRatesRefreshed: false,
		refreshedReferenceCollections: [],
		taxRateDeleteIds: [],
		appliedTaxRateDeleteCount: 0,
		reDerived: [],
		escalations: [],
		persisted: false,
		actions: {
			targetedPulls: [],
			deletes: [],
			rebaselineCollections: [],
			reDeriveBarcode: [],
			reFetchCollections: [],
			escalations: [],
			nextState: { cursor: { sequence: 0 }, baselineDigests: new Map() },
		},
	};
}

function dedupeSorted(ids: number[]): number[] {
	return [...new Set(ids)].sort((left, right) => left - right);
}

function wooIdsFromDocs(docs: SyncedDocument[]): number[] {
	return dedupeSorted(
		docs
			.map((doc) => Number((doc.payload as { id?: unknown }).id))
			.filter((id) => Number.isSafeInteger(id) && id > 0)
	);
}

function idsFor(
	groups: readonly { collection: HybridCollection; ids: number[] }[],
	collection: HybridCollection
): number[] {
	const ids: number[] = [];
	for (const group of groups) {
		if (group.collection === collection) {
			ids.push(...group.ids);
		}
	}
	return dedupeSorted(ids);
}

/**
 * Whether this poll carries a tax-rate UPDATE/ADD — a changed/new tax rate
 * (targetedPulls) or a config-stale tax_rates collection (reFetchCollections).
 * Both reconcile through the `taxRates:all` full refresh. (Deletes are handled
 * separately: the refresh only upserts and never prunes a tombstoned rate.)
 */
function taxRateRefreshNeeded(actions: ReplicationActions): boolean {
	return (
		actions.targetedPulls.some((group) => group.collection === 'tax_rates') ||
		actions.reFetchCollections.includes('tax_rates')
	);
}

/**
 * Whether this poll carries ANY change to the given reference collection — a
 * create/update (targetedPulls) OR a delete (deletes). All reconcile through the
 * single greedy `<collection>:all` refresh: it upserts current rows and
 * set-difference-prunes a deleted one, so (unlike tax rates) a reference delete does
 * NOT need a separate tombstone arm.
 */
function referenceRefreshNeeded(
	actions: ReplicationActions,
	collection: ReferenceCollection
): boolean {
	return (
		actions.targetedPulls.some((group) => group.collection === collection) ||
		actions.deletes.some((group) => group.collection === collection)
	);
}

export async function applyReplicationActions(
	actions: ReplicationActions,
	handlers: ReplicationActionHandlers
): Promise<ApplyReplicationActionsResult> {
	const { log } = handlers;
	const emit = (event: SyncEvent): void => {
		try {
			handlers.observe?.(event);
		} catch {
			// best-effort: a directly-supplied observer that throws must NEVER break the
			// apply tree — least of all skip the persistState commit below.
		}
	};
	/** Emit a count-bearing apply event (`apply.pull` / `apply.delete`), `warn` on a shortfall. */
	const emitCount = (
		type: string,
		collection: HybridCollection,
		requested: number,
		applied: number
	): void =>
		emit({
			type,
			level: applied < requested ? 'warn' : 'info',
			collection,
			fields: { requested, applied },
		});

	for (const collection of actions.rebaselineCollections) {
		if (collection === 'products' || collection === 'variations' || collection === 'customers') {
			const ids = wooIdsFromDocs(await handlers.loadSyncedDocs(collection));
			let applied = 0;
			if (ids.length > 0) {
				applied =
					collection === 'products'
						? await handlers.pullProducts(ids)
						: collection === 'variations'
							? await handlers.pullVariations(ids)
							: await handlers.pullCustomers(ids);
			}
			log(
				applied < ids.length
					? `change-signal: WARNING ${collection} rebaseline pull applied ${applied}/${ids.length} — unapplied record(s) consumed by the cursor; a re-sync may be needed`
					: `change-signal: rebaseline ${collection} pull applied ${applied}/${ids.length} id(s)`
			);
			emitCount('apply.rebaseline', collection, ids.length, applied);
		} else if (collection === 'tax_rates') {
			await handlers.refreshTaxRates();
			log('change-signal: rebaseline refreshed the tax_rates collection');
			emitCount('apply.rebaseline', collection, 1, 1);
		} else {
			await handlers.refreshReferenceCollection(collection);
			log(`change-signal: rebaseline refreshed the ${collection} collection`);
			emitCount('apply.rebaseline', collection, 1, 1);
		}
	}

	// 1) PRODUCT targeted pulls. Variations are NOT fetchable via wc/v3
	//    products?include= (a separate resource) so they are deferred below.
	const targetedProductIds = idsFor(actions.targetedPulls, 'products');
	let appliedProductCount = 0;
	if (targetedProductIds.length > 0) {
		appliedProductCount = await handlers.pullProducts(targetedProductIds);
		if (appliedProductCount < targetedProductIds.length) {
			log(
				`change-signal: WARNING targeted pull applied ${appliedProductCount}/${targetedProductIds.length} — unapplied change(s) consumed by the cursor; a re-sync may be needed`
			);
		} else {
			log(`change-signal: targeted product pull for ${targetedProductIds.length} id(s)`);
		}
		emitCount('apply.pull', 'products', targetedProductIds.length, appliedProductCount);
	}

	// 2) PRODUCT deletes — tombstones applied locally, never fetched.
	const deletedProductIds = idsFor(actions.deletes, 'products');
	let appliedDeleteCount = 0;
	if (deletedProductIds.length > 0) {
		appliedDeleteCount = await handlers.deleteProducts(deletedProductIds);
		if (appliedDeleteCount < deletedProductIds.length) {
			log(
				`change-signal: WARNING product delete applied ${appliedDeleteCount}/${deletedProductIds.length} — tombstone(s) consumed by the cursor; a re-sync may be needed`
			);
		} else {
			log(`change-signal: deleted ${appliedDeleteCount} local product doc(s)`);
		}
		emitCount('apply.delete', 'products', deletedProductIds.length, appliedDeleteCount);
	}

	// 3) TAX-RATE deletes — a tombstone needs an explicit local delete because the
	//    upsert-only refresh (step 4) never prunes a deleted rate.
	const taxRateDeleteIds = idsFor(actions.deletes, 'tax_rates');
	let appliedTaxRateDeleteCount = 0;
	if (taxRateDeleteIds.length > 0) {
		appliedTaxRateDeleteCount = await handlers.deleteTaxRates(taxRateDeleteIds);
		if (appliedTaxRateDeleteCount < taxRateDeleteIds.length) {
			log(
				`change-signal: WARNING tax-rate delete applied ${appliedTaxRateDeleteCount}/${taxRateDeleteIds.length} — tombstone(s) consumed by the cursor; a re-sync may be needed`
			);
		} else {
			log(`change-signal: deleted ${appliedTaxRateDeleteCount} local tax-rate doc(s)`);
		}
		emitCount('apply.delete', 'tax_rates', taxRateDeleteIds.length, appliedTaxRateDeleteCount);
	}

	// 4) TAX-RATE refresh — UPDATE/ADD or a config-stale tax_rates collection ride
	//    the `taxRates:all` full refresh (upsert). REQUIRED in-tick: the engine
	//    advanced its in-memory cursor on poll(), so there is no replayable
	//    deferred state to fall back on (PR #195).
	let taxRatesRefreshed = false;
	if (taxRateRefreshNeeded(actions)) {
		await handlers.refreshTaxRates();
		taxRatesRefreshed = true;
		log('change-signal: tax-rate change detected — refreshed the tax_rates collection');
		emit({ type: 'apply.refresh', level: 'info', collection: 'tax_rates' });
	}

	// 4b) Reference collections (coupons / categories / brands / tags) — small greedy
	//     pull-only sets. ANY change (create, update, or delete) reconciles through one
	//     `<collection>:all` re-pull: the greedy fetcher is prunable, so it upserts
	//     current rows and set-difference-prunes a deleted one. No per-id pull, no
	//     separate delete arm (unlike products/customers; unlike tax rates whose lane
	//     only upserts). One handler, dispatched per changed collection.
	const refreshedReferenceCollections: ReferenceCollection[] = [];
	for (const collection of REFERENCE_COLLECTIONS) {
		if (referenceRefreshNeeded(actions, collection)) {
			await handlers.refreshReferenceCollection(collection);
			refreshedReferenceCollections.push(collection);
			log(`change-signal: ${collection} change detected — refreshed the ${collection} collection`);
			emit({ type: 'apply.refresh', level: 'info', collection });
		}
	}

	// 5) Barcode re-derive — re-derive locally first (no server round-trip), else
	//    fall back to a re-fetch (ADR 0006). The rebuilt index is APPLIED here,
	//    BEFORE persistState advances the config baseline below — otherwise the
	//    baseline moves (the setting change stops re-reporting) while scans keep
	//    the stale index.
	const reDerived: ReDeriveResult[] = [];
	for (const target of actions.reDeriveBarcode) {
		const docs = await handlers.loadSyncedDocs(target.collection);
		const rebuilt = rebuildBarcodeIndexForConfig({ docs, activeFields: target.activeFields });
		if (rebuilt.staleCollection) {
			const refetched = await handlers.reFetchCollection(target.collection);
			log(
				`change-signal: ${target.collection} config stale and barcode field absent locally — re-fetch of ${refetched} id(s)`
			);
			reDerived.push({ collection: target.collection, rederived: false });
			emit({
				type: 'apply.refetch',
				level: 'info',
				collection: target.collection,
				fields: { refetched, reason: 'barcode-field-absent' },
			});
		} else {
			const applied = await handlers.applyBarcodeIndex(target.collection, rebuilt);
			if (applied) {
				log(
					`change-signal: re-derived + applied ${target.collection} barcode index from ${docs.length} doc(s) by [${target.activeFields.join(', ')}]`
				);
				reDerived.push({ collection: target.collection, rederived: true });
				emit({
					type: 'apply.barcode-rederive',
					level: 'info',
					collection: target.collection,
					fields: { docs: docs.length, applied: true },
				});
			} else {
				// The host declined the write (e.g. a mid-tick scope switch dropped the
				// guarded index update) — surface it instead of reporting a false apply.
				log(
					`change-signal: WARNING ${target.collection} barcode re-derive not applied (dropped — e.g. a mid-tick scope switch); a re-sync may be needed`
				);
				reDerived.push({ collection: target.collection, rederived: false });
				emit({
					type: 'apply.barcode-rederive',
					level: 'warn',
					collection: target.collection,
					fields: { docs: docs.length, applied: false },
				});
			}
		}
	}

	// 6) Stale collections with NO re-derivable barcode field → re-fetch the whole
	//    collection. tax_rates is handled by the refresh above (step 4), so skip it
	//    here rather than mis-routing it through the generic re-fetch path.
	for (const collection of actions.reFetchCollections) {
		if (collection === 'tax_rates') {
			continue;
		}
		const refetched = await handlers.reFetchCollection(collection);
		log(
			`change-signal: ${collection} config stale (no barcode field) — re-fetch of ${refetched} id(s)`
		);
		emit({
			type: 'apply.refetch',
			level: 'info',
			collection,
			fields: { refetched, reason: 'config-stale' },
		});
	}

	// 7) VARIATION targeted pulls — parent-mediated; the host fetches them through
	//    the versioned `{syncBase}/variations` endpoint (the server resolves
	//    parents), mirroring the product pull's shortfall surfacing.
	const targetedVariationIds = idsFor(actions.targetedPulls, 'variations');
	let appliedVariationCount = 0;
	if (targetedVariationIds.length > 0) {
		appliedVariationCount = await handlers.pullVariations(targetedVariationIds);
		if (appliedVariationCount < targetedVariationIds.length) {
			log(
				`change-signal: WARNING variation pull applied ${appliedVariationCount}/${targetedVariationIds.length} — unapplied change(s) consumed by the cursor; a re-sync may be needed`
			);
		} else {
			log(`change-signal: targeted variation pull for ${targetedVariationIds.length} id(s)`);
		}
		emitCount('apply.pull', 'variations', targetedVariationIds.length, appliedVariationCount);
	}

	// 7b) VARIATION deletes — tombstones applied locally, never fetched.
	const variationDeleteIds = idsFor(actions.deletes, 'variations');
	let appliedVariationDeleteCount = 0;
	if (variationDeleteIds.length > 0) {
		appliedVariationDeleteCount = await handlers.deleteVariations(variationDeleteIds);
		if (appliedVariationDeleteCount < variationDeleteIds.length) {
			log(
				`change-signal: WARNING variation delete applied ${appliedVariationDeleteCount}/${variationDeleteIds.length} — tombstone(s) consumed by the cursor; a re-sync may be needed`
			);
		} else {
			log(`change-signal: deleted ${appliedVariationDeleteCount} local variation doc(s)`);
		}
		emitCount('apply.delete', 'variations', variationDeleteIds.length, appliedVariationDeleteCount);
	}

	// 7c) CUSTOMER targeted pulls — a data collection detected via the sequence-log
	//     (wp_users: no barcode config, not in the wp_posts sweep). Fetched by id
	//     through the host's targeted customer lane, mirroring the product pull's
	//     shortfall surfacing.
	const targetedCustomerIds = idsFor(actions.targetedPulls, 'customers');
	let appliedCustomerCount = 0;
	if (targetedCustomerIds.length > 0) {
		appliedCustomerCount = await handlers.pullCustomers(targetedCustomerIds);
		if (appliedCustomerCount < targetedCustomerIds.length) {
			log(
				`change-signal: WARNING targeted customer pull applied ${appliedCustomerCount}/${targetedCustomerIds.length} — unapplied change(s) consumed by the cursor; a re-sync may be needed`
			);
		} else {
			log(`change-signal: targeted customer pull for ${targetedCustomerIds.length} id(s)`);
		}
		emitCount('apply.pull', 'customers', targetedCustomerIds.length, appliedCustomerCount);
	}

	// 7d) CUSTOMER deletes — tombstones applied locally, never fetched.
	const customerDeleteIds = idsFor(actions.deletes, 'customers');
	let appliedCustomerDeleteCount = 0;
	if (customerDeleteIds.length > 0) {
		appliedCustomerDeleteCount = await handlers.deleteCustomers(customerDeleteIds);
		if (appliedCustomerDeleteCount < customerDeleteIds.length) {
			log(
				`change-signal: WARNING customer delete applied ${appliedCustomerDeleteCount}/${customerDeleteIds.length} — tombstone(s) consumed by the cursor; a re-sync may be needed`
			);
		} else {
			log(`change-signal: deleted ${appliedCustomerDeleteCount} local customer doc(s)`);
		}
		emitCount('apply.delete', 'customers', customerDeleteIds.length, appliedCustomerDeleteCount);
	}

	// 8) Escalations — surface/alert only; NEVER auto-loop a pull (a stuck record a
	//    pull is not fixing would just spin).
	for (const escalation of actions.escalations) {
		log(
			`change-signal: ESCALATION ${escalation.collection} id ${escalation.id} (${escalation.status}, ${escalation.detector}) — stuck, NOT auto-pulled`
		);
		emit({
			type: 'apply.escalation',
			level: 'warn',
			collection: escalation.collection,
			fields: { id: escalation.id, status: escalation.status, detector: escalation.detector },
		});
	}

	// 9) Persist the advanced state — ONLY now, after every handler above resolved.
	//    A thrown handler skips this, so the cursor/baselines never advance past
	//    unprocessed work (a failed poll re-drains; redelivery is safe, skipping is
	//    not — ADR 0005).
	await handlers.persistState(actions.nextState);

	return {
		targetedProductIds,
		appliedProductCount,
		deletedProductIds,
		appliedDeleteCount,
		targetedVariationIds,
		appliedVariationCount,
		variationDeleteIds,
		appliedVariationDeleteCount,
		targetedCustomerIds,
		appliedCustomerCount,
		customerDeleteIds,
		appliedCustomerDeleteCount,
		taxRatesRefreshed,
		refreshedReferenceCollections,
		taxRateDeleteIds,
		appliedTaxRateDeleteCount,
		reDerived,
		escalations: actions.escalations,
		persisted: true,
		actions,
	};
}
