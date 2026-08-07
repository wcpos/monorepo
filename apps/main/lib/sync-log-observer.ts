import type {
	SyncEvent,
	SyncEventFields,
	SyncEventFieldsBase,
	SyncEventType,
	SyncObserver,
} from '@wcpos/sync-core';
import { isVerboseDiagnostics, type LogTerminalFields, promoteRecorder } from '@wcpos/utils/logger';

import { presetFor } from '../components/health/performance-logic';
import { normalizeSyncCollection } from './sync-status';

export type PersistLogRow = (
	level: 'debug' | 'info' | 'warn' | 'error',
	message: string,
	context: Record<string, unknown>,
	terminal?: LogTerminalFields,
	toast?: { title: string; description?: string }
) => void;

/**
 * Row policy for ONE event type. Generic in the type so the callbacks below see
 * the field shape `@wcpos/sync-core` declares for it: `didWork` on `signal.cycle`
 * reads `f.pulls` as a `number | undefined`, not an `unknown` that `num()` would
 * quietly turn into 0 if the emitter ever renamed it.
 *
 * The callbacks are written in METHOD syntax on purpose: it keeps them bivariant,
 * which is what lets a per-type row live in the erased `Map` the observer looks
 * up at runtime.
 */
type Conformance<T extends SyncEventType = SyncEventType> = {
	/** operationType written to the row; groups units of work in the UI. */
	operationType: string;
	/** Terminal outcome for this event type. */
	outcome: NonNullable<LogTerminalFields['outcome']>;
	/** False when this event is internal narration, even if its emitter raises the level. */
	visible?: boolean;
	/** Cashier-facing severity when it intentionally differs from the engine severity. */
	level?: 'info' | 'warn' | 'error';
	/**
	 * Request a cashier-facing toast for this row. Returns the toast content
	 * separately from `message`: the persisted row message is forensic (record
	 * ids, HTTP codes, repeat-collapse discrimination) while a snackbar has to
	 * read as a sentence the cashier acts on.
	 */
	toast?(event: SyncEvent, fields: SyncEventFieldsBase): { title: string; description?: string };
	/** Return false to route this occurrence to the check ring instead of a row
	 *  (idle work). Omit to always persist. */
	didWork?(fields: SyncEventFields<T>): boolean;
	/**
	 * The row's persisted message. NOT the on-screen title: the Logs UI titles
	 * every row by translating `context.type` through the event-label registry at
	 * render time, because a string baked in here is stuck in the language the
	 * till ran when the row was written (#912). What this text is still for:
	 * support/export narration, the detail line under a quiet row, and the
	 * repeat-collapse discriminator — a record message carrying the id and reason
	 * is what keeps two different failing records in two rows.
	 * Falls back to event.message ?? event.type.
	 */
	message?(event: SyncEvent, fields: SyncEventFieldsBase): string;
	/**
	 * Debug-level occurrences of this type are forensic evidence (a transient
	 * failure the arc later settled, #899): persist them AT debug, which the
	 * logger routes to the flight recorder and — under verbose diagnostics —
	 * to a durable row. Types without this flag keep the hard debug drop below.
	 */
	forensic?: boolean;
};

/**
 * EVERY event type gets a row — that is the whole point of the table being typed
 * `Record<SyncEventType, …>`. A new engine event does not compile until someone
 * decides how a merchant should read it, instead of silently inheriting the
 * `sync.other`/`failed` default and turning up in the failure bucket of the log.
 *
 * The `satisfies` clause below is the developer-time signal: it names the
 * missing key in your editor the moment you add an event type. The apps/main
 * typecheck task also makes it a merge gate; `scripts/check-sync-event-types.mjs`
 * retains the focused check in `pnpm test:scripts`.
 */
type ConformanceTable = { [T in SyncEventType]: Conformance<T> };

/** The outcome vocabulary an emitter may stamp explicitly via `fields.outcome`. */
const EXPLICIT_OUTCOMES = new Set<NonNullable<LogTerminalFields['outcome']>>([
	'ok',
	'recovered',
	'failed',
	'rejected',
	'cancelled',
	'unknown',
]);

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

function sanitizeReason(value: unknown): string | undefined {
	if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
		return undefined;
	}
	const sanitized = String(value)
		.trim()
		.replace(/\s+/g, ' ')
		// Query strings can carry tokens, so any `?`-introduced run is stripped
		// wholesale rather than only `?key=value` runs. Over-redaction is the safe
		// error on an export path that must be handable to support by construction;
		// prose is unaffected in practice because a sentence's `?` is followed by a
		// space, which ends the match.
		.replace(/\?[^\s)]+/g, '[redacted]')
		.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]');
	return sanitized.length > 200 ? `${sanitized.slice(0, 199)}…` : sanitized;
}

/**
 * The affected record's id, across both field vocabularies: push/queue events
 * name it `recordId`, while `apply.escalation` (the pull-side repair signal)
 * names it `id`. Without this the escalation row would fall back to a generic
 * message AND lose its repeat-collapse key, so consecutive escalations for
 * different records would fold into one row.
 */
function recordIdOf(fields: SyncEventFieldsBase): unknown {
	return fields.recordId ?? fields.id;
}

function recordMessage(verb: string): NonNullable<Conformance['message']> {
	return (event, fields) => {
		const recordId = recordIdOf(fields);
		if (recordId === undefined || recordId === null) {
			return sanitizeReason(event.message) ?? event.type;
		}
		const collection =
			event.collection !== undefined
				? normalizeSyncCollection(event.collection)
				: typeof fields.collection === 'string'
					? normalizeSyncCollection(fields.collection)
					: 'record';
		const status =
			typeof fields.status === 'number' && Number.isFinite(fields.status)
				? fields.status
				: undefined;
		const reason = sanitizeReason(fields.reason);
		const reasonSuffix =
			status !== undefined && reason
				? ` (HTTP ${status}: ${reason})`
				: status !== undefined
					? ` (HTTP ${status})`
					: reason
						? ` (${reason})`
						: '';
		return `${collection} ${String(recordId)} — ${verb}${reasonSuffix}`;
	};
}

/**
 * The policy an unclassified event type inherits: nothing but a FAILURE is worth
 * a row, and when one comes it lands in `sync.other`.
 *
 * `didWork: () => false` is what preserves the pre-table behaviour exactly. The
 * did-work gate is bypassed for warn/error (see the observer below), so an
 * unclassified failure still persists as `sync.other`/`failed`, while an info
 * narration is dropped — which is what an absent row did before. Without the
 * gate, giving these types a row would START writing merchant-visible failure
 * rows for routine narration.
 */
const INHERITED_DEFAULT = {
	operationType: 'sync.other',
	outcome: 'failed',
	didWork: () => false,
} satisfies Conformance;

const INVISIBLE = { ...INHERITED_DEFAULT, visible: false } satisfies Conformance;

/**
 * Every event type that reads as ordinary sync work rather than a defect, mapped
 * to the row it writes. The `satisfies ConformanceTable` at the bottom is what
 * makes the map TOTAL: a type missing from here fails the build.
 */
const CONFORMANCE_TABLE = {
	'signal.cycle': {
		operationType: 'sync.cycle',
		outcome: 'ok',
		didWork: (f) => num(f.pulls) + num(f.deletes) > 0,
	},
	'signal.cursor': { operationType: 'sync.cursor', outcome: 'unknown' },
	'signal.tick.error': { operationType: 'sync.cycle', outcome: 'failed' },
	'engine.lane.tick': {
		operationType: 'sync.lane',
		outcome: 'ok',
		didWork: (f) =>
			f.status === 'error' ||
			num(f.pushed) + num(f.conflicts) + num(f.deferred) + num(f.failed) + num(f.rejected) > 0,
	},
	// Cadence rows (#846). All four are transitions, never steady state, so they
	// are cheap enough to persist unconditionally — and they are the only record
	// of how often a till was asking, which is the first question support has when
	// a merchant reports "sync felt slow yesterday". Outcomes are 'ok' rather than
	// 'failed' on purpose: adapting to a struggling server is the app working,
	// and the observer's derivation below still promotes an explicit
	// `outcome: 'recovered'` when a back-off closes out (#899).
	'cadence.start': { operationType: 'sync.cadence', outcome: 'ok' },
	'cadence.reconfigured': { operationType: 'sync.cadence', outcome: 'ok' },
	'cadence.backoff': { operationType: 'sync.cadence', outcome: 'ok' },
	'cadence.recovered': { operationType: 'sync.cadence', outcome: 'ok' },
	'engine.ready': { operationType: 'sync.startup', outcome: 'ok' },
	'engine.ready-failed': { operationType: 'sync.startup', outcome: 'failed' },
	'engine.ready-stalled': { operationType: 'sync.startup', outcome: 'unknown' },
	'engine.scope-switched': { operationType: 'sync.scope', outcome: 'ok' },
	'engine.collection-reset': { operationType: 'sync.reset', outcome: 'ok' },
	'engine.reset-needs-confirmation': { operationType: 'sync.reset', outcome: 'cancelled' },
	'engine.disposed': { operationType: 'sync.lifecycle', outcome: 'ok' },
	'engine.connectivity-error': { operationType: 'sync.lifecycle', outcome: 'failed' },
	'engine.pos-bootstrap-error': { operationType: 'sync.startup', outcome: 'failed' },
	'engine.guard': { operationType: 'sync.scope', outcome: 'cancelled' },
	'apply.pull': { operationType: 'sync.apply', outcome: 'ok', didWork: (f) => num(f.applied) > 0 },
	'apply.delete': {
		operationType: 'sync.apply',
		outcome: 'ok',
		didWork: (f) => num(f.applied) > 0,
	},
	'apply.rebaseline': { operationType: 'sync.apply', outcome: 'ok' },
	'apply.refetch': {
		operationType: 'sync.apply',
		outcome: 'ok',
		didWork: (f) => num(f.refetched) > 0,
	},
	'apply.refresh': { operationType: 'sync.apply', outcome: 'ok' },
	'apply.barcode-rederive': { operationType: 'sync.apply', outcome: 'ok' },
	'targeted.pull.shortfall-prune': { operationType: 'sync.apply', outcome: 'recovered' },
	'apply.escalation': {
		operationType: 'sync.record',
		outcome: 'failed',
		message: recordMessage('pull escalation'),
	},
	'coverage.require.outcome': {
		operationType: 'sync.coverage',
		outcome: 'ok',
		didWork: (f) => num(f.documents) > 0 || num(f.requests) > 0,
	},
	'coverage.require.error': { operationType: 'sync.coverage', outcome: 'failed' },
	'coverage.existence-prime': { operationType: 'sync.coverage', outcome: 'ok' },
	'coverage.existence-reconcile': {
		operationType: 'sync.coverage',
		outcome: 'ok',
		didWork: (f) => num(f.pruned) + num(f.pulled) + num(f.repulled) > 0,
	},
	'coverage.compacted': {
		// Emitted on every retention pass, including the common no-op one; without
		// this gate an idle terminal writes a recurring 'ok' row that records no work.
		operationType: 'sync.coverage',
		outcome: 'ok',
		didWork: (f) => num(f.removed) > 0,
	},
	'coverage.ledger-rebuilt': { operationType: 'sync.coverage', outcome: 'recovered' },
	'transport.request': {
		operationType: 'sync.http',
		outcome: 'ok',
		// Failures only. A successful data-bearing request is a unit of work, but
		// the engine issues them continuously (a poll every few seconds, several
		// requests each), so persisting them would evict every other row well
		// inside the 25 MiB retention cap and destroy the log's diagnostic value.
		// Successful-attempt narration belongs in the flight recorder (WS3) and
		// the metrics rollups, which are built for that volume. An attempt that is
		// part of a refresh arc (carries an operationId, #899) is chain evidence,
		// not idle traffic — rare (once per JWT TTL), and without it the recovered
		// chain would be missing its successful ending under verbose.
		didWork: (f) => f.status === 0 || num(f.status) >= 400 || typeof f.operationId === 'string',
		forensic: true,
	},
	'push.outcome': {
		operationType: 'sync.record',
		outcome: 'ok',
		message: recordMessage('push completed'),
	},
	'push.error': {
		operationType: 'sync.record',
		outcome: 'failed',
		message: recordMessage('push failed'),
	},
	'push.aborted': {
		operationType: 'sync.record',
		outcome: 'cancelled',
		message: recordMessage('push aborted'),
	},
	'push.conflict': {
		operationType: 'sync.record',
		outcome: 'failed',
		message: recordMessage('push conflict'),
	},
	'push.in_progress': {
		operationType: 'sync.record',
		outcome: 'failed',
		message: recordMessage('push already in progress'),
	},
	'push.rejected': {
		operationType: 'sync.record',
		outcome: 'rejected',
		message: recordMessage('rejected by server'),
	},
	// R1: the write SUCCEEDED — the server accepted the order and the till
	// adopted its totals — but the money came back different, which is the one
	// thing a cashier has to know about a sale that already left the counter.
	//
	// Deliberately NOT `sync.record`. That operationType means "this record's
	// transfer", and `deriveStuckRecords` reads its newest `failed`/`rejected`
	// row as "did not make it to the server". This row is written AFTER the
	// `push.outcome` ok row — the push emits during the drain, the divergence
	// rides the post-drain flush — so as a `sync.record` failure it won the tie
	// and reported completed sales as undeliverable: "can't upload — server
	// totals differ from the till", with a stuck pill on Orders. Observed on
	// dev-next for 2 of 3 plain cash sales (70954-70956).
	//
	// `sync.money` keeps it at error, keeps the record named, keeps it
	// filterable — and keeps it out of a derivation that is answering a
	// different question. `failed` stays as the outcome because the POS's
	// calculation genuinely did not survive; filtering by outcome must not hide
	// it (the PY02001 lesson).
	'push.money-divergence': {
		operationType: 'sync.money',
		outcome: 'failed',
		message: recordMessage('server totals differ from the till'),
	},
	'queue.write.needs-revision': {
		operationType: 'sync.record',
		outcome: 'rejected',
		message: recordMessage('needs revision'),
	},
	'queue.write.auto-reverted': {
		operationType: 'sync.record',
		outcome: 'recovered',
		level: 'error',
		toast(event, fields) {
			const reason = sanitizeReason(fields.reason);
			return {
				title: 'Change rejected by your store — reverted',
				description: reason
					? `${reason} See Store health for details.`
					: 'See Store health for details.',
			};
		},
		message: recordMessage('change reverted to server value; see Store health'),
	},
	'queue.write.conflict-transition': {
		operationType: 'sync.record',
		outcome: 'failed',
		message: recordMessage('conflict transition failed'),
	},
	'queue.write.reschedule-failed': {
		operationType: 'sync.record',
		outcome: 'failed',
		message: recordMessage('reschedule failed'),
	},
	'queue.write.resolve': {
		operationType: 'sync.record',
		outcome: 'ok',
		message: recordMessage('conflict resolved'),
	},
	'queue.write.discard-repull-deferred': {
		operationType: 'sync.record',
		outcome: 'unknown',
		message: recordMessage('repull deferred'),
	},
	'queue.write.born-twice-requeue': {
		operationType: 'sync.record',
		outcome: 'unknown',
		message: recordMessage('requeued after duplicate create'),
	},
	'queue.write.drain': {
		operationType: 'sync.queue',
		outcome: 'ok',
		didWork: (f) => num(f.pushed) + num(f.conflicts) + num(f.failed) + num(f.rejected) > 0,
	},
	'queue.scheduler.drain': {
		operationType: 'sync.queue',
		outcome: 'ok',
		didWork: (f) => num(f.succeeded) + num(f.failed) > 0,
	},
	'queue.write.enqueued': { operationType: 'sync.queue', outcome: 'ok' },
	'queue.write.annihilate': { operationType: 'sync.queue', outcome: 'ok' },
	'queue.write.coalesce': { operationType: 'sync.queue', outcome: 'ok' },
	'queue.write.tick.error': { operationType: 'sync.queue', outcome: 'failed' },
	'engine.listener-error': { operationType: 'sync.lifecycle', outcome: 'failed' },

	// ————————————————————————————————————————————————————————————————————————
	// Explicit cashier-facing decisions for the 21 events that formerly inherited
	// the runtime default. Invisible rows remain available to diagnostics only.
	// ————————————————————————————————————————————————————————————————————————
	// decided: visible — reaching the hard cap leaves the cashier's list incomplete.
	'browse-window.backstop-reached': {
		operationType: 'sync.coverage',
		outcome: 'unknown',
		didWork: () => true,
	},
	// decided: invisible — a racing reset only changes internal lane bookkeeping.
	'browse-window.eviction-skipped': INVISIBLE,
	// decided: invisible — evicting superseded lanes is routine internal housekeeping.
	'browse-window.lanes-evicted': INVISIBLE,
	// decided: invisible — the engine continues the bounded page walk automatically.
	'browse-window.page-budget-reached': INVISIBLE,
	// decided: invisible — the engine withdraws stale coverage and reloads it automatically.
	'browse-window.prefix-invalidated': INVISIBLE,
	// decided: invisible — serving a requirement locally is per-request engine narration.
	'coverage.gate.hit': INVISIBLE,
	// decided: invisible — fetching a requirement is per-request engine narration.
	'coverage.gate.miss': INVISIBLE,
	// decided: invisible — raw require-plane log lines belong in diagnostics.
	'coverage.require.log': INVISIBLE,
	// decided: visible — the requested customer ordering is unavailable to the cashier.
	'customer.browse-window.sort-rejected': {
		operationType: 'sync.coverage',
		outcome: 'rejected',
		didWork: () => true,
	},
	// decided: invisible — the activity counter self-corrects without changing cashier work.
	'demand.activity-counter-underflow': INVISIBLE,
	// decided: visible — missing barcode settings can degrade product scanning.
	'engine.barcode-selector-hydrate-failed': {
		operationType: 'sync.startup',
		outcome: 'failed',
		level: 'warn',
		didWork: () => true,
	},
	// decided: invisible — scheduling a catch-up tick after reconnect is internal narration.
	'engine.reconnect.retick': INVISIBLE,
	// decided: visible — single-tab-only syncing explains multi-tab degradation.
	'engine.write-leader.degraded': {
		operationType: 'sync.lifecycle',
		outcome: 'unknown',
		didWork: () => true,
	},
	// decided: visible — a crashed background lane is cashier-visible degradation until retry.
	'maintenance.lane.error': {
		operationType: 'sync.lane',
		outcome: 'failed',
		level: 'warn',
		didWork: () => true,
	},
	// decided: invisible — routine maintenance summaries are background narration.
	'maintenance.lane.tick': INVISIBLE,
	// decided: visible — approximate catalogue totals explain incomplete-looking results.
	'product.browse-window.approximate': {
		operationType: 'sync.coverage',
		outcome: 'unknown',
		didWork: () => true,
	},
	// decided: visible — an unsupported brand filter changes the products the cashier sees.
	'product.browse-window.brand-filter-ignored': {
		operationType: 'sync.coverage',
		outcome: 'rejected',
		didWork: () => true,
	},
	// decided: visible — an unsaved rejection can leave a cashier's sale unrecoverable.
	'push.dead-letter-unpersisted': {
		operationType: 'sync.record',
		outcome: 'failed',
		didWork: () => true,
		message: recordMessage('rejected change could not be saved for recovery'),
	},
	// decided: invisible — periodic drain progress is high-volume loading narration.
	'queue.drain.progress': INVISIBLE,
	// decided: visible — rebuilding a refused write confirms the record is queued to retry.
	'queue.write.requeue-rebuilt': {
		operationType: 'sync.record',
		outcome: 'recovered',
		didWork: () => true,
		message: recordMessage('queued to send again'),
	},
	// decided: invisible — raw change-signal log lines belong in diagnostics.
	'signal.log': INVISIBLE,
} satisfies ConformanceTable;

/**
 * Observer-side terminal-row policy. A Map makes event types sourced from data
 * unable to resolve inherited Object.prototype members — which still matters
 * after the table closed, because `event.type` is only typed at COMPILE time:
 * an older build's observer can be handed `constructor` by anything downstream.
 */
const CONFORMANCE = new Map<string, Conformance>(Object.entries(CONFORMANCE_TABLE));

/**
 * Pure event→persist mapping; the caller owns logger wiring and engine-identity
 * guarding. Idle work and info-level narration are intentionally left for the
 * later recent-checks ring.
 */
export function createSyncLogObserver(options: { persist: PersistLogRow; nowMs?: () => number }): {
	observe: SyncObserver;
} {
	const nowMs = options.nowMs ?? Date.now;
	// HTTP attempts that SUCCEED are deliberately not durable rows (see the
	// transport.request entry above). Their existence must still be recoverable
	// from the durable layer, or a slow cycle becomes unattributable: hourly
	// host_metrics buckets are too coarse to say which cycle issued the traffic.
	// So the observer tallies every attempt it sees and flushes the aggregate onto
	// the next cycle row. These count the requests observed SINCE THE PREVIOUS
	// CYCLE ROW — not strictly the cycle's own, because the fetcher is shared with
	// concurrent lanes and carries no cycle context. The field names say so.
	let httpRequests = 0;
	let httpMs = 0;
	let httpMaxMs = 0;
	let httpErrors = 0;

	const observe: SyncObserver = (event: SyncEvent) => {
		const fields = (event.fields ?? {}) as Record<string, unknown>;
		const mapped = CONFORMANCE.get(event.type);
		const isInvisible = mapped?.visible === false;
		const level = isInvisible ? 'debug' : (mapped?.level ?? event.level);
		const isFailure = level === 'warn' || level === 'error';

		// Tally BEFORE any gate, so successful attempts — which never persist — still
		// reach the aggregate.
		if (event.type === 'transport.request') {
			httpRequests += 1;
			const attemptMs = num(fields.durationMs);
			httpMs += attemptMs;
			if (attemptMs > httpMaxMs) httpMaxMs = attemptMs;
			if (fields.status === 0 || num(fields.status) >= 400) httpErrors += 1;
		}
		if (isInvisible && !isVerboseDiagnostics()) return;

		// Debug narration never becomes a durable row unless verbose diagnostics
		// explicitly admits it: forensic events and invisible internal evidence are
		// forwarded at debug, which the logger persists only in that mode.
		if (level === 'debug' && mapped?.forensic !== true && !isInvisible) return;

		if (mapped === undefined && !isFailure) return;
		// Unreachable for an event from THIS build — `CONFORMANCE` covers every
		// member of `SyncEventType`, and a type outside it does not compile. It
		// stays as defence against version skew: an engine bundle newer than the
		// app shell (a web build served mid-deploy, a stale Electron shell) can
		// still emit a name this table has never heard of, and a merchant's failure
		// must never be dropped just because its label is unknown here.
		const conformance: Conformance = mapped ?? INHERITED_DEFAULT;
		// The did-work gate only ever suppresses IDLE work. A warn/error event is
		// never idle, so it bypasses the gate entirely: several emitters raise the
		// level on a signal their counters don't carry — `queue.scheduler.drain`
		// goes to `error` on completionLost/failureLost/renewalLost while
		// `succeeded` and `failed` are both 0 — and gating those would silently
		// drop exactly the lost-work evidence this observer exists to preserve.
		if (conformance.didWork && !isFailure && !isInvisible && !conformance.didWork(fields)) return;

		const collection =
			event.collection !== undefined ? normalizeSyncCollection(event.collection) : undefined;
		// Outcome derivation. The table's outcome is the SUCCESS-path outcome; a row
		// may only wear it when the event actually succeeded, or filtering by
		// outcome hides the incident (the PY02001 lesson, spec §3). Two ways an
		// entry mapped 'ok' can turn out not to be:
		//   1. the emitter raised the level — apply.pull/apply.delete/
		//      apply.rebaseline/apply.barcode-rederive all emit warn for work they
		//      could not apply;
		//   2. the counters say so while the level stays info — queue.write.drain
		//      and the engine.lane.tick summary carry failed/rejected records on an
		//      otherwise routine drain.
		// Explicit non-'ok' outcomes (rejected/cancelled/unknown) are deliberate
		// classifications and are never overridden. An emitter that saw the WHOLE
		// arc settle may also stamp the outcome itself via `fields.outcome` (#899:
		// the fetcher marks an absorbed 401 `recovered` only after the retry
		// succeeded) — that first-hand classification wins over table derivation.
		const explicitOutcome =
			typeof fields.outcome === 'string' &&
			EXPLICIT_OUTCOMES.has(fields.outcome as NonNullable<LogTerminalFields['outcome']>)
				? (fields.outcome as NonNullable<LogTerminalFields['outcome']>)
				: undefined;
		let outcome = explicitOutcome ?? conformance.outcome;
		if (explicitOutcome === undefined && outcome === 'ok') {
			if (isFailure) outcome = 'failed';
			else if (num(fields.failed) + num(fields.rejected) > 0) outcome = 'failed';
			else if (fields.status === 'error') outcome = 'failed';
		}

		const durationMs =
			typeof fields.durationMs === 'number' && Number.isFinite(fields.durationMs)
				? fields.durationMs
				: undefined;
		const reason = sanitizeReason(fields.reason);
		const context: Record<string, unknown> = {
			...fields,
			type: event.type,
			...(collection !== undefined ? { collection } : {}),
		};
		// The explicit outcome is promoted to the terminal column; a copy in context
		// would just shadow it with a second, unfilterable source of truth.
		if (explicitOutcome !== undefined) delete context.outcome;
		if (event.type === 'signal.cycle' && httpRequests > 0) {
			context.httpRequestsSinceLastCycle = httpRequests;
			context.httpMsSinceLastCycle = httpMs;
			context.httpMaxMsSinceLastCycle = httpMaxMs;
			if (httpErrors > 0) context.httpErrorsSinceLastCycle = httpErrors;
			httpRequests = 0;
			httpMs = 0;
			httpMaxMs = 0;
			httpErrors = 0;
		}
		if (fields.reason !== undefined) {
			if (reason === undefined) delete context.reason;
			else context.reason = reason;
		}
		// The engine reports its cadence in milliseconds because it has no idea the
		// Performance screen exists. Naming the preset here — where the presets are
		// defined — turns "tierMs: 60000" into a row a merchant and a support
		// engineer read the same way, without teaching the engine about app UI.
		if (conformance.operationType === 'sync.cadence') {
			// `sync.cadence` is only ever reached by the four `cadence.*` types, which
			// share one declared field shape. `SyncEvent` is not a discriminated union,
			// so the assertion is how that proof reaches `fields` — it is the single
			// place an open payload meets its declared shape, and the `typeof` guards
			// below still hold the line at runtime.
			const cadence = fields as SyncEventFields<'cadence.start'>;
			const tierMs = cadence.tierMs;
			const batchSize = cadence.pullBatchSize;
			if (typeof tierMs === 'number' && typeof batchSize === 'number') {
				context.preset = presetFor(tierMs, batchSize);
			}
		}
		if (conformance.operationType === 'sync.record') {
			context.direction = event.type === 'apply.escalation' ? 'pull' : 'push';
			const recordId = recordIdOf(fields);
			if (recordId !== undefined && context.recordId === undefined) context.recordId = recordId;
		}
		if (event.type === 'push.dead-letter-unpersisted' && event.message !== undefined) {
			context.detail = event.message;
		}
		// Only a REAL chain id is forwarded. Minting a synthetic one per event would
		// make every row unique and so disable repeat-collapse for the ten ungated
		// non-record types (apply.refresh, queue.write.enqueued/coalesce,
		// engine.guard, …), reintroducing exactly the flooding collapse exists to
		// prevent — and it would fill a column that spec §2 reserves for chaining
		// related steps with uniqueness salt, making it unqueryable for WS5.
		// Distinguishing timed units of work is the logger's job instead (see
		// persistLog: a record carrying durationMs never collapses).
		const operationId = typeof fields.operationId === 'string' ? fields.operationId : undefined;

		options.persist(
			isFailure ? level : level === 'debug' ? 'debug' : 'info',
			conformance.message?.(event, { ...fields, ...(reason ? { reason } : {}) }) ??
				event.message ??
				event.type,
			context,
			{
				operationType: conformance.operationType,
				outcome,
				...(operationId !== undefined ? { operationId } : {}),
				...(durationMs !== undefined
					? { durationMs, startedAt: (event.at ?? nowMs()) - durationMs }
					: {}),
			},
			conformance.toast?.(event, { ...fields, ...(reason ? { reason } : {}) })
		);
		// Presentation stays warn, but a lane crash still promotes the preceding
		// recorder evidence just as its original error-level row did.
		if (event.type === 'maintenance.lane.error') {
			void promoteRecorder('maintenance.lane.error');
		}
	};

	return { observe };
}
