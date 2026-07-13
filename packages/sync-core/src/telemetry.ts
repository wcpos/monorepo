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
 * A structured engine event. `type` is a dotted name; metrics derive from `type`
 * + `fields`. Immutable: an event is fanned out to many sinks, so no sink may
 * mutate it (the type is `readonly` and `composeObservers` freezes it).
 */
export type SyncEvent = {
	/** Dotted event name, e.g. `pull.batch`, `push.outcome`, `change-signal.poll`. */
	readonly type: string;
	readonly level: SyncEventLevel;
	/** The collection this event concerns, when applicable (per-collection metrics). */
	readonly collection?: string;
	/** Human-readable one-line summary (for the logger sink). */
	readonly message?: string;
	/** Structured payload — `durationMs` is aggregated into timings; others are free-form. */
	readonly fields?: Readonly<Record<string, unknown>>;
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

const LEVEL_ORDER: Record<SyncEventLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/**
 * Format one token (field value, collection, or message) for a logfmt-ish line.
 * Uniformly safe: any rendered value containing whitespace / `=` / `"` (including
 * a serialized object whose JSON has internal spaces, or a multi-word message) is
 * JSON-quoted so it stays a single, unambiguous token a parser can recover.
 */
function formatToken(value: unknown): string {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
		return String(value);
	let raw: string;
	if (typeof value === 'string') {
		raw = value;
	} else {
		try {
			raw = JSON.stringify(value) ?? String(value);
		} catch {
			raw = String(value);
		}
	}
	return /[\s="]/.test(raw) ? JSON.stringify(raw) : raw;
}

/**
 * Render a `SyncEvent` as one readable, parseable line:
 * `[level] type [collection] [message] key=value ...`. Deterministic (fields in
 * insertion order). Pure — the formatting half of the line logger.
 */
export function formatSyncEventLine(event: SyncEvent): string {
	const parts: string[] = [`[${event.level}]`, event.type];
	if (event.collection) parts.push(formatToken(event.collection));
	if (event.message) parts.push(formatToken(event.message));
	if (event.fields) {
		for (const [key, value] of Object.entries(event.fields)) {
			parts.push(`${key}=${formatToken(value)}`);
		}
	}
	return parts.join(' ');
}

export type LineLoggerOptions = {
	/** Minimum level to emit; events below it are dropped. Default `'debug'` (all). */
	minLevel?: SyncEventLevel;
};

/**
 * A `SyncObserver` that formats events into lines and forwards them to a string
 * sink — the bridge from the structured telemetry seam to a host's existing
 * `log: (line: string) => void` (the engine's current logging surface) or
 * `console.log`. Compose it alongside `createMetricsCollector().observe` so one
 * `emit` feeds both metrics and logs.
 */
export function createLineLogger(
	sink: (line: string) => void,
	options: LineLoggerOptions = {}
): SyncObserver {
	const min = LEVEL_ORDER[options.minLevel ?? 'debug'];
	return (event) => {
		if (LEVEL_ORDER[event.level] < min) return;
		try {
			sink(formatSyncEventLine(event));
		} catch {
			// best-effort: a broken host log sink never breaks the engine emit, even
			// when this logger is the sole (un-composed) observer.
		}
	};
}
