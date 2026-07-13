/**
 * Representation-config fingerprint signal — the new tier ADR 0006 adds to close
 * Scenario 1 (settings-change staleness), the gap ADR 0005's three-tier hybrid
 * is STRUCTURALLY blind to.
 *
 * THE PROBLEM. A global WCPOS/WooCommerce SETTING change alters the *served
 * representation* of MANY records without bumping any record's `date_modified`
 * and without touching any record's storage. Canonical example: an admin
 * changes which meta key is the POS "barcode" field (`_sku` ->
 * `_global_unique_id`) — every product's effective barcode changes, but no
 * product row changes. The existing engine cannot see this:
 *   - TIER 1 sequence-log needs a per-record save hook — none fires.
 *   - TIER 2 hash-checksum digests the raw product row — unchanged.
 *   - TIER 3 revision-hash WOULD catch it (it rebuilds the served
 *     representation) but is never polled (112–142s at 10k).
 * `docs/experiments/change-signal-candidates.md` already admits this case
 * "remains revision-hash territory".
 *
 * THE SIGNAL. The server reports, per collection, a cheap FINGERPRINT = a hash
 * over the representation-affecting settings that feed that collection's served
 * representation (for `products`: the active barcode meta-key mapping, etc.).
 * The client retains a baseline fingerprint per collection and compares each
 * poll. On mismatch → that collection's representation config moved → mark it
 * stale → the host re-derives locally (the barcode index) when possible, else
 * re-fetches.
 *
 * WHY A FINGERPRINT, NOT A BARE EPOCH COUNTER. A counter that only a hook
 * increments inherits the sequence-log blind spot: a setting changed by a
 * hook-bypassing path (another plugin's `update_option`, wp-cli, direct SQL on
 * `wp_options`) would not increment it. A fingerprint computed from the ACTUAL
 * current settings is SELF-HEALING — it differs whenever the real config
 * differs, regardless of whether a hook fired. This is the same reason ADR 0005
 * chose hash-checksum's *absolute* match verdict over range-checksum's
 * cross-sweep diff. The single primitive delivers BOTH things the product
 * needs: PROACTIVE (a settings-save hook recomputes/reports it instantly so
 * detection isn't delayed to the next poll) and AUTOMATIC client-side detection
 * (the client notices the fingerprint moved on its routine poll even with no
 * proactive signal).
 *
 * Pure module: no rxdb, no fetch, no DOM. The host supplies the port (it owns
 * the PHP plugin's `/changes/config-fingerprint` endpoint); the engine only
 * consumes the injected source + now(). `BarcodeConfigCollection` is reused from
 * hybridChangeSignal so the stale signal speaks the same collection vocabulary
 * the rest of the engine does.
 */

import type { BarcodeConfigCollection } from './hybridChangeSignal';

// --- The snapshot the host reports -------------------------------------------

/**
 * One reading of the per-collection representation-config fingerprints. The
 * server computes each `fingerprints[collection]` as a hash over the settings
 * that feed that collection's served representation; the engine never
 * interprets the string beyond equality. `barcodeFields` is OPTIONAL and, when
 * present, carries the resolved active barcode field list per collection so the
 * client can re-derive its local barcode index without a server round-trip (the
 * products specialization). Mapping names are PAYLOAD field names (e.g. `sku`,
 * `global_unique_id`) — the already-synced doc shape — NOT raw meta keys.
 */
export type ConfigFingerprintSnapshot = {
	fingerprints: Record<BarcodeConfigCollection, string>;
	barcodeFields?: Record<BarcodeConfigCollection, string[]>;
};

// --- The PORT the host implements --------------------------------------------

/**
 * The detection surface the host supplies — an abstraction over the PHP
 * plugin's `GET /changes/config-fingerprint`. The engine depends ONLY on this;
 * it never knows about fetch, URLs, or envelopes.
 */
export type ConfigFingerprintSource = {
	/**
	 * Report the current per-collection representation-config fingerprints (and,
	 * optionally, the resolved barcode field list). Called once per poll(). A
	 * settings-save hook on the server keeps the reported fingerprint current, so
	 * a PROACTIVE report and a routine poll read the same self-healing value.
	 */
	pollConfigFingerprints(): Promise<ConfigFingerprintSnapshot>;
};

// --- Outcome types ------------------------------------------------------------

/** The per-collection baseline the engine retains between polls. */
export type ConfigFingerprintBaseline = Partial<Record<BarcodeConfigCollection, string>>;

/**
 * One fingerprint move. `source: 'config-fingerprint'` is the permanent
 * provenance tag (instrumentation is permanent per ADR 0004) — every stale
 * signal records WHICH fingerprint moved, consistent with ADR 0005's per-change
 * `source` / per-mismatch `detector` tagging.
 */
export type ConfigFingerprintChange = {
	collection: BarcodeConfigCollection;
	/** The retained baseline fingerprint (undefined-as-string only on a seeded mismatch path; populated here). */
	from: string;
	to: string;
	source: 'config-fingerprint';
};

export type ConfigChangePollOutcome = {
	/**
	 * Collections whose representation config moved this poll — "re-fetch /
	 * re-derive this collection". Connects to the hybrid engine's existing
	 * re-fetch surface; a stale collection means the same thing a flagged bucket
	 * does: this collection's local copy must be reconciled.
	 */
	staleCollections: BarcodeConfigCollection[];
	/** The fingerprint moves, each tagged with provenance. */
	changed: ConfigFingerprintChange[];
	/**
	 * The resolved active barcode field list from the latest snapshot, surfaced
	 * so the host can re-derive the local barcode index for a stale `products`
	 * collection without a server round-trip. Absent when the host does not
	 * report it.
	 */
	barcodeFields?: Record<BarcodeConfigCollection, string[]>;
	/**
	 * The updated retained baseline (a fresh object so the host can persist it
	 * without mutating the engine). A host that persists this across restarts
	 * seeds the NEXT engine's `baseline` with it, so a settings change that
	 * happened while offline is caught on reconnect.
	 */
	baseline: ConfigFingerprintBaseline;
};

// --- The engine ---------------------------------------------------------------

/**
 * The result of a DEFERRED poll: the computed outcome plus a `commit` thunk that
 * advances the retained baseline. The compute is done; the baseline is NOT yet
 * advanced. The composing caller (the hybrid engine) calls `commit()` only after
 * its whole poll has succeeded, so a later TIER 1 / sweep failure cannot strand
 * the move — the next poll re-computes against the un-advanced baseline and
 * re-reports the stale collection.
 */
export type DeferredConfigPoll = {
	/** The computed outcome; its `baseline` is the one that WILL be committed. */
	outcome: ConfigChangePollOutcome;
	/** Advance the retained baseline to the computed one. */
	commit(): void;
};

export type ConfigChangeSignal = {
	/** Poll and IMMEDIATELY commit the new baseline (the standalone contract). */
	poll(): Promise<ConfigChangePollOutcome>;
	/**
	 * Poll but DEFER advancing the baseline — the caller commits explicitly once
	 * its larger unit of work succeeds. This is the seam ADR 0006 uses so the
	 * config tier honours ADR 0005's commit-only-on-success invariant: the
	 * baseline never advances on a poll that ultimately throws. The caller MUST
	 * call `commit()` (or discard the poll) before the next poll; the hybrid
	 * engine guarantees that via its own poll serialization.
	 */
	pollDeferred(): Promise<DeferredConfigPoll>;
};

export function createConfigChangeSignal(input: {
	source: ConfigFingerprintSource;
	/**
	 * Retained per-collection baseline the poll diffs against. COLD-START
	 * SEMANTICS (mirrors hybridChangeSignal's per-bucket cold-start handling):
	 *   - A first poll with NO persisted baseline ADOPTS the current fingerprints
	 *     WITHOUT flagging stale — there is nothing to diff against yet, so a
	 *     fresh client never raises a false positive on startup.
	 *   - A first poll WITH a persisted prior baseline (the host restored what it
	 *     last saw before going offline) that DISAGREES DOES flag stale — a
	 *     settings change that happened while the client was offline must be
	 *     caught on reconnect. This is the whole point of persisting the baseline.
	 * The distinction is PER COLLECTION: a collection absent from the baseline is
	 * adopted silently; a collection present in the baseline is diffed. Seeding
	 * an empty baseline ({}) is identical to seeding none.
	 */
	baseline?: ConfigFingerprintBaseline;
	/**
	 * Injected clock, for parity with the rest of sync-core's pure modules. The
	 * config signal has no time-based cadence of its own (it runs once per host
	 * poll), so `now` is accepted but unused today; kept in the signature so a
	 * future time-bounded re-report cadence is a non-breaking addition.
	 */
	now?: () => number;
}): ConfigChangeSignal {
	// The retained, COMMITTED baseline. Cloned so the caller's object is never
	// mutated by the engine. Advanced only by commitBaseline() — the deferred
	// path holds that off until the host's whole poll succeeds.
	const baseline: ConfigFingerprintBaseline = { ...(input.baseline ?? {}) };
	const { source } = input;

	let pollQueue: Promise<void> = Promise.resolve();

	/**
	 * PURE diff of a snapshot against the current committed baseline — never
	 * mutates `baseline`. Returns the stale collections, their provenance-tagged
	 * moves, and the baseline that WOULD be committed. Splitting compute from
	 * commit is what lets the deferred path advance the baseline only on success.
	 */
	function computeOutcome(snapshot: ConfigFingerprintSnapshot): {
		staleCollections: BarcodeConfigCollection[];
		changed: ConfigFingerprintChange[];
		nextBaseline: ConfigFingerprintBaseline;
	} {
		const staleCollections: BarcodeConfigCollection[] = [];
		const changed: ConfigFingerprintChange[] = [];
		const nextBaseline: ConfigFingerprintBaseline = { ...baseline };

		for (const collection of Object.keys(snapshot.fingerprints) as BarcodeConfigCollection[]) {
			const current = snapshot.fingerprints[collection];
			const previous = baseline[collection];
			if (previous === undefined) {
				// PER-COLLECTION cold start: first sighting of this collection's
				// fingerprint — adopt it as the baseline, raise no stale flag. Only a
				// collection the baseline already knows about can be a relative
				// mismatch.
				nextBaseline[collection] = current;
				continue;
			}
			if (previous !== current) {
				staleCollections.push(collection);
				changed.push({ collection, from: previous, to: current, source: 'config-fingerprint' });
				// The move is reported once; the (committed) baseline adopts the new
				// value so a SETTLED config stops re-flagging. Edge-triggered like
				// sequence-log delivering a change row once — but, crucially, only
				// COMMITTED on success (see commitBaseline / pollDeferred), so a poll
				// that throws after this does NOT strand the move.
				nextBaseline[collection] = current;
			}
		}

		return { staleCollections, changed, nextBaseline };
	}

	/** Advance the retained baseline in place (keys are only added/updated). */
	function commitBaseline(nextBaseline: ConfigFingerprintBaseline): void {
		Object.assign(baseline, nextBaseline);
	}

	async function pollCommitting(): Promise<ConfigChangePollOutcome> {
		const snapshot = await source.pollConfigFingerprints();
		const { staleCollections, changed, nextBaseline } = computeOutcome(snapshot);
		commitBaseline(nextBaseline);
		return {
			staleCollections,
			changed,
			barcodeFields: snapshot.barcodeFields,
			baseline: { ...baseline },
		};
	}

	async function pollDeferring(): Promise<DeferredConfigPoll> {
		const snapshot = await source.pollConfigFingerprints();
		const { staleCollections, changed, nextBaseline } = computeOutcome(snapshot);
		return {
			// The surfaced baseline is the one that WILL be committed — the host
			// persists it only on a successful poll (the caller commits then too).
			outcome: {
				staleCollections,
				changed,
				barcodeFields: snapshot.barcodeFields,
				baseline: { ...nextBaseline },
			},
			commit: () => commitBaseline(nextBaseline),
		};
	}

	/**
	 * Serialize polls so two concurrent callers cannot interleave and race the
	 * retained baseline (same guard the hybrid engine uses). For the deferred
	 * path this serializes the COMPUTE; the caller's later commit is synchronous
	 * and runs before the next poll under the hybrid engine's own serialization.
	 */
	function serialize<T>(task: () => Promise<T>): Promise<T> {
		const run = pollQueue.then(task, task);
		pollQueue = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	return {
		poll: () => serialize(pollCommitting),
		pollDeferred: () => serialize(pollDeferring),
	};
}
