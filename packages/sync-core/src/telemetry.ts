/**
 * Engine telemetry spine (roadmap P0-2) — the ONE structured observability seam
 * the sync engine emits to, so the whole engine is measured + observable through
 * a single interface instead of ad-hoc `log: (line) => void` strings.
 *
 * A `SyncEvent` is a structured, level-tagged event with a dotted `type`
 * (`pull.batch`, `push.outcome`, `change-signal.poll`, `record.identified`,
 * `apply.delete`, `error`, …), an optional `collection`, and a typed `fields`
 * payload (counts, `durationMs`, statuses). Observers consume events: a metrics
 * collector tallies them, a logger formats them, a host forwards them to its real
 * telemetry pipeline. The engine depends only on the `SyncObserver` seam — the
 * sinks are injected (this module stays dependency-free, in sync-core).
 */

export type SyncEventLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * THE closed vocabulary of engine events — every dotted name the engine may emit.
 *
 * Closed on purpose. The observer that turns events into the cashier-facing log
 * (`apps/main/lib/sync-log-observer.ts`) maps each type to a row policy, and an
 * unmapped type used to fall to a `sync.other`/`failed` default: a brand-new
 * engine event landed in the FAILURE bucket of a merchant's log unnoticed. That
 * happened for real (`push.money-divergence`, reported as undeliverable sales —
 * see the comment on its conformance row). With the vocabulary closed, the
 * observer's map is `satisfies Record<SyncEventType, …>`, so a new event type is
 * a COMPILE error until someone decides how it should read.
 *
 * Kept honest by `scripts/check-sync-event-types.mjs` (wired into
 * `pnpm test:scripts`): it scans the engine sources for emitted type literals and
 * fails when one is missing here — the same trick as the label gate next door.
 *
 * Not to be confused with `SyncEventType` from
 * `@wcpos/utils/logger/generated/event-labels.generated` — that one is the
 * merchant-LABEL vocabulary generated from `event-registry.json`, which is a
 * different (overlapping) set: it also labels the receipt-email queue's
 * `email.queue.*` rows, which never reach a `SyncObserver`. This union is the
 * telemetry seam's own vocabulary; the label gate keeps every member of it
 * labelled.
 */
export type SyncEventType =
	// apply
	| 'apply.barcode-rederive'
	| 'apply.delete'
	| 'apply.escalation'
	| 'apply.pull'
	| 'apply.rebaseline'
	| 'apply.refetch'
	| 'apply.refresh'
	// browse-window
	| 'browse-window.backstop-reached'
	| 'browse-window.eviction-skipped'
	| 'browse-window.lanes-evicted'
	| 'browse-window.page-budget-reached'
	| 'browse-window.prefix-invalidated'
	// cadence
	| 'cadence.backoff'
	| 'cadence.reconfigured'
	| 'cadence.recovered'
	| 'cadence.start'
	// coverage
	| 'coverage.compacted'
	| 'coverage.existence-prime'
	| 'coverage.existence-reconcile'
	| 'coverage.gate.hit'
	| 'coverage.gate.miss'
	| 'coverage.ledger-rebuilt'
	| 'coverage.require.error'
	| 'coverage.require.log'
	| 'coverage.require.outcome'
	// customer
	| 'customer.browse-window.sort-rejected'
	// demand
	| 'demand.activity-counter-underflow'
	// engine
	| 'engine.barcode-selector-hydrate-failed'
	| 'engine.collection-reset'
	| 'engine.connectivity-error'
	| 'engine.disposed'
	| 'engine.guard'
	| 'engine.lane.tick'
	| 'engine.listener-error'
	| 'engine.pos-bootstrap-error'
	| 'engine.ready'
	| 'engine.ready-failed'
	| 'engine.ready-stalled'
	| 'engine.reconnect.retick'
	| 'engine.reset-needs-confirmation'
	| 'engine.scope-switched'
	| 'engine.write-leader.degraded'
	// maintenance
	| 'maintenance.lane.error'
	| 'maintenance.lane.tick'
	// product
	| 'product.browse-window.approximate'
	| 'product.browse-window.brand-filter-ignored'
	// push
	| 'push.aborted'
	| 'push.conflict'
	| 'push.dead-letter-unpersisted'
	| 'push.error'
	| 'push.in_progress'
	| 'push.money-divergence'
	| 'push.outcome'
	| 'push.rejected'
	// queue
	| 'queue.drain.progress'
	| 'queue.scheduler.drain'
	| 'queue.write.annihilate'
	| 'queue.write.born-twice-requeue'
	| 'queue.write.coalesce'
	| 'queue.write.conflict-transition'
	| 'queue.write.discard-repull-deferred'
	| 'queue.write.drain'
	| 'queue.write.enqueued'
	| 'queue.write.needs-revision'
	| 'queue.write.requeue-rebuilt'
	| 'queue.write.reschedule-failed'
	| 'queue.write.resolve'
	| 'queue.write.tick.error'
	// signal
	| 'signal.cursor'
	| 'signal.cycle'
	| 'signal.log'
	| 'signal.tick.error'
	// targeted
	| 'targeted.pull.shortfall-prune'
	// transport
	| 'transport.request';

/** The open payload every event carries; the shape below narrows it per type. */
export type SyncEventFieldsBase = Readonly<Record<string, unknown>>;

/**
 * Declared `fields` shapes, for the event types whose payload a CONSUMER reads
 * by name rather than just forwarding. Deliberately partial: the ~60 types not
 * listed here keep the open record. This is the set the cashier-log observer
 * reads today (its did-work gates and its cadence preset lookup) — the reads
 * that used to be `unknown` and silently coerced through `num()`, so a field
 * renamed at the emitter degraded to "did no work" instead of failing a build.
 *
 * These are declarations, not enforcement: `SyncEvent.fields` stays open, so an
 * emitter may still send more. Everything listed is optional because most of
 * these payloads are assembled conditionally.
 */
export type SyncEventFieldsByType = {
	'signal.cycle': { readonly pulls?: number; readonly deletes?: number };
	'engine.lane.tick': {
		/** Lane report status — `'error'` is the one the observer keys on. */
		readonly status?: string;
		readonly pushed?: number;
		readonly conflicts?: number;
		readonly deferred?: number;
		readonly failed?: number;
		readonly rejected?: number;
	};
	'apply.pull': { readonly applied?: number };
	'apply.delete': { readonly applied?: number };
	'apply.refetch': { readonly refetched?: number };
	'coverage.require.outcome': { readonly documents?: number; readonly requests?: number };
	'coverage.existence-reconcile': {
		readonly pruned?: number;
		readonly pulled?: number;
		readonly repulled?: number;
	};
	'coverage.compacted': { readonly removed?: number };
	'transport.request': {
		/** HTTP status, or `0` for a request that never reached the server. */
		readonly status?: number;
		readonly operationId?: string;
	};
	'queue.write.drain': {
		readonly pushed?: number;
		readonly conflicts?: number;
		readonly failed?: number;
		readonly rejected?: number;
	};
	'queue.scheduler.drain': { readonly succeeded?: number; readonly failed?: number };
	'cadence.start': CadenceFields;
	'cadence.reconfigured': CadenceFields;
	'cadence.backoff': CadenceFields;
	'cadence.recovered': CadenceFields;
};

/** The cadence a lane is running at — the four `cadence.*` events share it. */
type CadenceFields = { readonly tierMs?: number; readonly pullBatchSize?: number };

/** The declared field shape for `T`, or the open record when it has none. */
export type SyncEventFields<T extends SyncEventType> = T extends keyof SyncEventFieldsByType
	? SyncEventFieldsByType[T]
	: SyncEventFieldsBase;

/**
 * A structured engine event. `type` is a dotted name; metrics derive from `type`
 * + `fields`. Immutable: an event is fanned out to many sinks, so no sink may
 * mutate it (the type is `readonly` and `composeObservers` freezes it).
 */
export type SyncEvent = {
	/** Dotted event name, e.g. `apply.pull`, `push.outcome`, `signal.cycle`. */
	readonly type: SyncEventType;
	readonly level: SyncEventLevel;
	/** The collection this event concerns, when applicable (per-collection metrics). */
	readonly collection?: string;
	/** Human-readable one-line summary (for the logger sink). */
	readonly message?: string;
	/**
	 * Structured payload — `durationMs` is aggregated into timings; others are
	 * free-form. Stays OPEN: {@link SyncEventFieldsByType} declares the shapes a
	 * consumer reads by name, it does not close what an emitter may send.
	 */
	readonly fields?: SyncEventFieldsBase;
	/** Epoch ms; the emitter fills it if absent. */
	readonly at?: number;
};

/** The single seam the engine emits to. Sinks (metrics, logger, host pipeline) implement it. */
export type SyncObserver = (event: SyncEvent) => void;

/** A sink that ignores everything — the safe default when no observer is wired. */
export const NOOP_OBSERVER: SyncObserver = () => {};

/**
 * Fan an event out to several observers. Telemetry is best-effort: a throwing
 * sink must never break the engine or starve the others, so EVERY sink (even a
 * lone one) is isolated in its own try/catch. The event is frozen before fan-out
 * so no sink can corrupt it for those that run after. Filters falsy entries so
 * callers can write `composeObservers(a, condition && b)`.
 */
export function composeObservers(
	...observers: (SyncObserver | false | null | undefined)[]
): SyncObserver {
	const sinks = observers.filter((o): o is SyncObserver => typeof o === 'function');
	if (sinks.length === 0) return NOOP_OBSERVER;
	return (event) => {
		const safe = Object.isFrozen(event) ? event : Object.freeze(event);
		for (const sink of sinks) {
			try {
				sink(safe);
			} catch {
				// best-effort: a broken sink never breaks the engine or the other sinks
			}
		}
	};
}

/** Aggregated `durationMs` for one event type. */
export type TimingMetric = { count: number; totalMs: number; minMs: number; maxMs: number };

export type MetricsSnapshot = {
	/** Event count by `type`. */
	events: Record<string, number>;
	/** Event count `type` → `collection` → count. */
	byCollection: Record<string, Record<string, number>>;
	/** `durationMs` aggregates by `type` (across all collections). */
	timings: Record<string, TimingMetric>;
	/** `durationMs` aggregates `type` → `collection` → timing, so e.g. `pull.batch` for orders vs products stay separate. */
	timingsByCollection: Record<string, Record<string, TimingMetric>>;
	/**
	 * Sum of each numeric `fields` value (except `durationMs`, which has dedicated
	 * timings) by `type` → field → total. This is throughput: e.g. total docs
	 * `applied`/`requested` across all `apply.pull` operations, not just how many
	 * operations ran.
	 */
	fieldSums: Record<string, Record<string, number>>;
	/** The same field sums broken down `type` → `collection` → field → total. */
	fieldSumsByCollection: Record<string, Record<string, Record<string, number>>>;
	/** Count of `level: 'error'` events. */
	errors: number;
};

export type MetricsCollector = {
	/** Wire this as a `SyncObserver`. */
	readonly observe: SyncObserver;
	/** A deep, point-in-time copy of the tallies. */
	snapshot(): MetricsSnapshot;
	/** Zero everything. */
	reset(): void;
};

/**
 * Field names summed as additive throughput by default. Only counters belong
 * here — NOT identifiers (`id`) or timings (`durationMs`), which would be
 * meaningless to add up. Pass `createMetricsCollector({ additiveFields })` to
 * override for a different event vocabulary.
 */
export const DEFAULT_ADDITIVE_FIELDS: readonly string[] = [
	'requested',
	'applied',
	'count',
	'docs',
	'refetched',
	'deleted',
	'pulled',
	'created',
	'updated',
	'bytes',
];

export type MetricsCollectorOptions = {
	/** Field names to sum as throughput. Defaults to {@link DEFAULT_ADDITIVE_FIELDS}. */
	additiveFields?: Iterable<string>;
};

function bumpTiming(map: Map<string, TimingMetric>, key: string, ms: number): void {
	const t = map.get(key);
	if (t) {
		t.count += 1;
		t.totalMs += ms;
		t.minMs = Math.min(t.minMs, ms);
		t.maxMs = Math.max(t.maxMs, ms);
	} else {
		map.set(key, { count: 1, totalMs: ms, minMs: ms, maxMs: ms });
	}
}

/** Add `value` to `map[key][field]`. */
function bumpSum(
	map: Map<string, Map<string, number>>,
	key: string,
	field: string,
	value: number
): void {
	const perField = map.get(key) ?? new Map<string, number>();
	perField.set(field, (perField.get(field) ?? 0) + value);
	map.set(key, perField);
}

/** Add `value` to `map[type][collection][field]`. */
function bumpSum3(
	map: Map<string, Map<string, Map<string, number>>>,
	type: string,
	collection: string,
	field: string,
	value: number
): void {
	const perCollection = map.get(type) ?? new Map<string, Map<string, number>>();
	bumpSum(perCollection, collection, field, value);
	map.set(type, perCollection);
}

/** Snapshot a `Map<string, number>` to a plain object. */
const countObj = (map: Map<string, number>): Record<string, number> => Object.fromEntries(map);
/** Snapshot nested count maps. */
const nestedCountObj = (
	map: Map<string, Map<string, number>>
): Record<string, Record<string, number>> =>
	Object.fromEntries([...map].map(([k, v]) => [k, countObj(v)]));
/** Snapshot a timing map, deep-copying each `TimingMetric`. */
const timingObj = (map: Map<string, TimingMetric>): Record<string, TimingMetric> =>
	Object.fromEntries([...map].map(([k, v]) => [k, { ...v }]));
const nestedTimingObj = (
	map: Map<string, Map<string, TimingMetric>>
): Record<string, Record<string, TimingMetric>> =>
	Object.fromEntries([...map].map(([k, v]) => [k, timingObj(v)]));
/** Snapshot a 3-deep numeric map (`type → collection → field → sum`). */
const nestedSumObj3 = (
	map: Map<string, Map<string, Map<string, number>>>
): Record<string, Record<string, Record<string, number>>> =>
	Object.fromEntries([...map].map(([k, v]) => [k, nestedCountObj(v)]));

/**
 * A metrics sink that tallies events into counters + `durationMs` timings, with a
 * per-collection breakdown. Backed by `Map`s, so an event `type`/`collection`
 * sourced from server data can never pollute `Object.prototype`. Pure in-memory;
 * the host snapshots it for a dashboard or forwards snapshots to a real backend.
 */
export function createMetricsCollector(options: MetricsCollectorOptions = {}): MetricsCollector {
	const additiveFields = new Set(options.additiveFields ?? DEFAULT_ADDITIVE_FIELDS);
	const events = new Map<string, number>();
	const byCollection = new Map<string, Map<string, number>>();
	const timings = new Map<string, TimingMetric>();
	const timingsByCollection = new Map<string, Map<string, TimingMetric>>();
	const fieldSums = new Map<string, Map<string, number>>();
	const fieldSumsByCollection = new Map<string, Map<string, Map<string, number>>>();
	let errors = 0;

	const observe: SyncObserver = (event) => {
		events.set(event.type, (events.get(event.type) ?? 0) + 1);
		if (event.level === 'error') errors += 1;
		if (event.collection) {
			const perType = byCollection.get(event.type) ?? new Map<string, number>();
			perType.set(event.collection, (perType.get(event.collection) ?? 0) + 1);
			byCollection.set(event.type, perType);
		}
		if (event.fields) {
			for (const [field, value] of Object.entries(event.fields)) {
				if (typeof value !== 'number' || !Number.isFinite(value)) continue;
				if (field === 'durationMs') {
					// latency → dedicated timings (count/total/min/max)
					bumpTiming(timings, event.type, value);
					if (event.collection) {
						const perType = timingsByCollection.get(event.type) ?? new Map<string, TimingMetric>();
						bumpTiming(perType, event.collection, value);
						timingsByCollection.set(event.type, perType);
					}
				} else if (additiveFields.has(field)) {
					// throughput → summed (only recognized counters; identifiers like `id`
					// are left as context — summing them would be meaningless).
					bumpSum(fieldSums, event.type, field, value);
					if (event.collection)
						bumpSum3(fieldSumsByCollection, event.type, event.collection, field, value);
				}
			}
		}
	};

	return {
		observe,
		snapshot(): MetricsSnapshot {
			return {
				events: countObj(events),
				byCollection: nestedCountObj(byCollection),
				timings: timingObj(timings),
				timingsByCollection: nestedTimingObj(timingsByCollection),
				fieldSums: nestedCountObj(fieldSums),
				fieldSumsByCollection: nestedSumObj3(fieldSumsByCollection),
				errors,
			};
		},
		reset(): void {
			events.clear();
			byCollection.clear();
			timings.clear();
			timingsByCollection.clear();
			fieldSums.clear();
			fieldSumsByCollection.clear();
			errors = 0;
		},
	};
}
