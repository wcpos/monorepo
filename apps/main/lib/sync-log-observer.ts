import type {
	SyncEvent,
	SyncEventFields,
	SyncEventFieldsBase,
	SyncEventType,
	SyncObserver,
} from '@wcpos/sync-core';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { ErrorCode } from '@wcpos/utils/logger/generated/error-codes.generated';
import { rejectedWriteCode } from '@wcpos/utils/logger/rejected-write-code';
import { isReportedRequestStatus } from '@wcpos/sync-engine';
import { isVerboseDiagnostics, type LogTerminalFields, promoteRecorder } from '@wcpos/utils/logger';

import { presetFor } from '../components/health/performance-logic';
import { normalizeSyncCollection } from './sync-status';

export type PersistLogRow = (
	level: 'debug' | 'info' | 'warn' | 'error',
	message: string,
	context: Record<string, unknown>,
	terminal?: LogTerminalFields,
	toast?: { title: string; description?: string },
	code?: ErrorCode
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
	code: ErrorCode | null | ((event: SyncEvent, fields: SyncEventFieldsBase) => ErrorCode | null);
	/** False when this event is internal narration, even if its emitter raises the level. */
	visible?: boolean;
	/**
	 * Cashier-facing severity when it intentionally differs from the engine
	 * severity. A function when the row is an attempt until it persists: it reads
	 * the attempt/streak count the emitter stamped and stays info below
	 * `PERSISTENT_FAILURE_STREAK`.
	 */
	level?: RowLevel | ((event: SyncEvent, fields: SyncEventFieldsBase) => RowLevel);
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

type RowLevel = 'info' | 'warn' | 'error';

/**
 * Failures in a row before a retried attempt reads as a failure that has
 * persisted. One failure is a blip the engine retries on its own; three in a
 * row — three ticks, or three pushes of one record, typically tens of seconds
 * apart — means the next retry is not going to fix it either.
 */
export const PERSISTENT_FAILURE_STREAK = 3;

/** Info while a retried failure is still an attempt; warn once it has persisted. */
const streakLevel = (count: unknown): RowLevel =>
	num(count) >= PERSISTENT_FAILURE_STREAK ? 'warn' : 'info';

/**
 * True when the failure was a request the transport layer already reported:
 * status 0 (the deadline row or the thrown-fetch transport row) or any non-2xx
 * answer but 304 (the transport row). Those rows own the incident, so the lane
 * or requirement row about the same request stays info. A 2xx poison page is
 * NOT covered — the transport row read it as a success. The rule is the
 * engine's own (`isReportedRequestStatus`), so stamping and reading agree.
 */
const requestReported = (fields: SyncEventFieldsBase): boolean =>
	isReportedRequestStatus(fields.status);

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

function httpStatusCode(status: number): ErrorCode {
	if (status === 401) return ERROR_CODES.SESSION_EXPIRED;
	if (status === 403) return ERROR_CODES.INSUFFICIENT_ROLE;
	if (status === 429) return ERROR_CODES.STORE_RATE_LIMITED;
	if (status === 0) return ERROR_CODES.SYNC_UNREACHABLE;
	// A response IS reachability — only status 0 (no response at all) may say
	// "cannot be reached". A 409 is the conflict the record-level events
	// already narrate (SYNC221); any other 4xx/5xx is the server answering
	// with an error (SYNC131). The old catch-all sent every unlisted status
	// to SYNC121, so a slow-but-answered 409 read as an unreachable store
	// (dev-next 2026-08-14: a 14.8s conflicted push labeled "cannot be
	// reached" while the server had refused it in plain HTTP).
	if (status === 409) return ERROR_CODES.RECORD_CONFLICT;
	// The protocol gate's deliberate refusal (wcpos/woocommerce-pos#1752).
	// Authoritative detection is body-keyed in the engine transport (the
	// status is advisory and middleboxes rewrite it); this only labels the
	// forensic request row when the status DID survive.
	if (status === 426) return ERROR_CODES.APP_UPDATE_REQUIRED;
	// Every other answer — a 4xx/5xx, an unexpected 1xx/3xx, a 2xx whose body
	// could not be read — is the server responding badly, never unreachability.
	return ERROR_CODES.STORE_SERVER_ERROR;
}

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
	code: null,
	didWork: () => false,
} satisfies Conformance;

const INVISIBLE = { ...INHERITED_DEFAULT, visible: false } satisfies Conformance;

/**
 * Every event type that reads as ordinary sync work rather than a defect, mapped
 * to the row it writes. The `satisfies ConformanceTable` at the bottom is what
 * makes the map TOTAL: a type missing from here fails the build.
 */
export const CONFORMANCE_TABLE = {
	'signal.cycle': {
		operationType: 'sync.cycle',
		outcome: 'ok',
		code: null,
		didWork: (f) => num(f.pulls) + num(f.deletes) > 0,
	},
	// A deliberate rebaseline, not lost data: the same tick re-pulls the stored
	// records and refreshes the reference lists, and `apply.rebaseline` warns
	// with SYNC321 if that reconcile comes up short. Telling the cashier to
	// "download the affected data again" asked for what the engine just did.
	'signal.cursor': {
		operationType: 'sync.cursor',
		outcome: 'unknown',
		code: null,
		level: 'info',
	},
	'signal.tick.error': {
		operationType: 'sync.cycle',
		outcome: 'failed',
		// The next cadence tick retries from the saved cursor. A failed request is
		// the transport/deadline row's to report; a local failure (bulkUpsert and
		// friends) alarms once it has failed several ticks running.
		level: (_event, fields) =>
			requestReported(fields) ? 'info' : streakLevel(fields.consecutiveFailures),
		// No status field means the failure was local, not transport — stamping an
		// "unreachable" code there would mislead (#836).
		code: (_event, fields) =>
			typeof fields.status !== 'number'
				? ERROR_CODES.SYNC_TASK_CRASHED
				: httpStatusCode(fields.status),
	},
	// The lanes retry on their next tick, so one slow answer is an attempt; the
	// row alarms once the same lane has timed out several times running.
	'engine.request.deadline': {
		operationType: 'sync.lane',
		outcome: 'failed',
		code: ERROR_CODES.SYNC_UNREACHABLE,
		level: (_event, fields) => streakLevel(fields.consecutiveDeadlines),
		message: (_event, fields) => `Request deadline exceeded after ${num(fields.elapsedMs)} ms`,
	},
	'engine.lane.tick': {
		operationType: 'sync.lane',
		outcome: 'ok',
		code: ERROR_CODES.SYNC_TASK_CRASHED,
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
	'cadence.start': { operationType: 'sync.cadence', outcome: 'ok', code: null },
	'cadence.reconfigured': { operationType: 'sync.cadence', outcome: 'ok', code: null },
	'cadence.backoff': { operationType: 'sync.cadence', outcome: 'ok', code: null },
	'cadence.recovered': { operationType: 'sync.cadence', outcome: 'ok', code: null },
	'engine.ready': { operationType: 'sync.startup', outcome: 'ok', code: null },
	'engine.ready-failed': {
		operationType: 'sync.startup',
		outcome: 'failed',
		code: ERROR_CODES.APP_START_FAILED,
	},
	'engine.ready-stalled': {
		operationType: 'sync.startup',
		outcome: 'unknown',
		code: ERROR_CODES.APP_START_SLOW,
		// The watchdog emits at error, but the CLIENT111 ruling is warn severity —
		// a stall that usually self-resolves must not read as a failure. The
		// first stall (15s) is info: a slow open usually completes and
		// `engine.ready` follows. Only the repeat (75s) is the warn.
		level: (_event, fields) => (num(fields.stalls) >= 2 ? 'warn' : 'info'),
	},
	'engine.scope-switched': { operationType: 'sync.scope', outcome: 'ok', code: null },
	'engine.collection-reset': { operationType: 'sync.reset', outcome: 'ok', code: null },
	// The reset was REFUSED, so nothing changed: the queued changes it would have
	// destroyed are still there and still send. The merchant's only reset path
	// (Store health → Database) confirms in its own dialog and never lands here.
	'engine.reset-needs-confirmation': {
		operationType: 'sync.reset',
		outcome: 'cancelled',
		code: null,
		level: 'info',
	},
	'engine.disposed': { operationType: 'sync.lifecycle', outcome: 'ok', code: null },
	'engine.connectivity-error': {
		operationType: 'sync.lifecycle',
		outcome: 'failed',
		code: ERROR_CODES.SYNC_UNREACHABLE,
	},
	'engine.pos-bootstrap-error': {
		operationType: 'sync.startup',
		outcome: 'failed',
		code: ERROR_CODES.APP_START_FAILED,
	},
	'engine.guard': {
		operationType: 'sync.scope',
		outcome: 'cancelled',
		code: null,
		level: 'info',
	},
	'apply.pull': {
		operationType: 'sync.apply',
		outcome: 'ok',
		code: ERROR_CODES.SYNC_PARTIAL,
		didWork: (f) => num(f.applied) > 0,
	},
	'apply.delete': {
		operationType: 'sync.apply',
		outcome: 'ok',
		code: ERROR_CODES.SYNC_PARTIAL,
		didWork: (f) => num(f.applied) > 0,
	},
	'apply.rebaseline': {
		operationType: 'sync.apply',
		outcome: 'ok',
		code: ERROR_CODES.SYNC_PARTIAL,
	},
	'apply.refetch': {
		operationType: 'sync.apply',
		outcome: 'ok',
		code: null,
		didWork: (f) => num(f.refetched) > 0,
	},
	'apply.refresh': { operationType: 'sync.apply', outcome: 'ok', code: null },
	// Info even when the rebuilt index was declined (`applied: false`, stamped
	// outcome failed): only a mid-tick scope switch declines it, which drops the
	// tick's other guarded writes too — the config baseline among them — so the
	// scope re-derives on its next tick. Nothing for the merchant to do.
	'apply.barcode-rederive': {
		operationType: 'sync.apply',
		outcome: 'ok',
		code: null,
		level: 'info',
	},
	// The designed tombstone path: local copies of ids the store no longer
	// serves are removed (pending local edits protected). Nothing to do.
	'targeted.pull.shortfall-prune': {
		operationType: 'sync.apply',
		outcome: 'recovered',
		code: null,
		level: 'info',
	},
	// A pull escalation is a READ-side divergence: the detector found this
	// record's local copy differs from the store's, so it needs status-aware
	// local repair. Nothing the cashier entered is stranded. It stays `sync.record`
	// /`failed` on purpose — that is what puts it in the attention list, which
	// is the whole point of an escalation the engine will not auto-repair
	// (`applyReplicationActions` §8) — but the CODE must not be
	// LOCAL_DB_WRITE_FAILED. That code means "could not be saved to the local
	// database", severity error, data-at-risk, contact-support, and it made a
	// routine catalogue re-check read as a data-loss event on Store health.
	// The direction and status fields let the UI distinguish a download from
	// removing a tombstoned record; neither path is an upload.
	'apply.escalation': {
		operationType: 'sync.record',
		outcome: 'failed',
		code: ERROR_CODES.LOCAL_RECORD_DIVERGED,
		message: recordMessage('pull escalation'),
	},
	// A previously-escalated record was verified matching by a complete integrity
	// sweep — the evidence-driven clearing signal for the attention banner (#1338).
	// outcome 'recovered' is what deriveStuckRecords reads as "no longer stuck"
	// (ruling #1082); direction 'pull' matches the escalation row it clears.
	'apply.escalation-cleared': {
		operationType: 'sync.record',
		outcome: 'recovered',
		code: null,
		level: 'info',
		message: recordMessage('pull escalation cleared'),
	},
	'coverage.require.outcome': {
		operationType: 'sync.coverage',
		outcome: 'ok',
		code: null,
		didWork: (f) => num(f.documents) > 0 || num(f.requests) > 0,
	},
	// The scheduler retries the task after a delay. A failed request is the
	// transport/deadline row's incident; a local failure loading the records has
	// no other row, so it stays a warn.
	'coverage.require.error': {
		operationType: 'sync.coverage',
		outcome: 'failed',
		code: ERROR_CODES.SYNC_TASK_CRASHED,
		level: (_event, fields) => (requestReported(fields) ? 'info' : 'warn'),
	},
	'coverage.existence-prime': { operationType: 'sync.coverage', outcome: 'ok', code: null },
	// A failed audit-cursor write (stamped outcome failed) is info while the next
	// pass can still save it; a cursor that keeps failing never advances, so the
	// audit rescans the same buckets forever — warn SYNC101 once that persists.
	'coverage.existence-reconcile': {
		operationType: 'sync.coverage',
		outcome: 'ok',
		code: (_event, fields) =>
			fields.outcome === 'failed' && streakLevel(fields.consecutiveFailures) === 'warn'
				? ERROR_CODES.LOCAL_DB_WRITE_FAILED
				: null,
		level: (_event, fields) =>
			fields.outcome === 'failed' ? streakLevel(fields.consecutiveFailures) : 'info',
		// Prune is the audit's only executed action. `missing`/`changed` are
		// observations, and windowed stores keep `missing` > 0 by design — counting
		// them as work would persist a steady-state row every audit cycle.
		// A failed cursor write is kept too: it is the evidence of a stuck audit.
		didWork: (f) => num(f.pruned) > 0 || f.outcome === 'failed',
	},
	'coverage.compacted': {
		// Emitted on every retention pass, including the common no-op one; without
		// this gate an idle terminal writes a recurring 'ok' row that records no work.
		operationType: 'sync.coverage',
		outcome: 'ok',
		code: null,
		didWork: (f) => num(f.removed) > 0,
	},
	'coverage.ledger-reattached': {
		operationType: 'sync.coverage',
		outcome: 'recovered',
		code: null,
		level: 'info',
	},
	// Derivable metadata the engine dropped and rebuilt itself — the sibling of
	// ledger-reattached, and just as nothing-to-do.
	'coverage.ledger-rebuilt': {
		operationType: 'sync.coverage',
		outcome: 'recovered',
		code: null,
		level: 'info',
	},
	'transport.request': {
		operationType: 'sync.http',
		outcome: 'ok',
		code: (_event, fields) => httpStatusCode(num(fields.status)),
		// Failures only. A successful data-bearing request is a unit of work, but
		// the engine issues them continuously (a poll every few seconds, several
		// requests each), so persisting them would evict every other row well
		// inside the 25 MiB retention cap and destroy the log's diagnostic value.
		// Successful-attempt narration belongs in the flight recorder (WS3) and
		// the metrics rollups, which are built for that volume. An attempt that is
		// part of a refresh arc (carries an operationId, #899) is chain evidence,
		// not idle traffic — rare (once per JWT TTL), and without it the recovered
		// chain would be missing its successful ending under verbose.
		didWork: (f) => requestReported(f) || typeof f.operationId === 'string',
		forensic: true,
	},
	'push.outcome': {
		operationType: 'sync.record',
		outcome: 'ok',
		code: null,
		message: recordMessage('push completed'),
	},
	// One push of one record, not the record's verdict. Each failure is info
	// until the same mutation has failed PERSISTENT_FAILURE_STREAK pushes running
	// (the adapter stamps `attempt`); what settles the rest:
	//  - 401: the write drain holds the session, and the auth layer's row
	//    (refresh failure / "Sync paused") is the one to act on;
	//  - 428: the drain refreshes the revision and re-pushes once; a failure
	//    parks as queue.write.needs-revision or dead-letters as push.rejected.
	//    Only when the refresh itself keeps throwing does the row back off and
	//    retry with nothing else reporting it — so a 428 counts its attempts too;
	//  - not retryable (a permanent 4xx, identity-ambiguous): it dead-letters,
	//    and push.rejected / queue.write.auto-reverted carry the verdict.
	// The push route's transport row is info for the same reason (engine-fetcher).
	'push.error': {
		operationType: 'sync.record',
		outcome: 'failed',
		level: (_event, fields) => {
			if (fields.status === 401) return 'info';
			if (fields.status === 428) return streakLevel(fields.attempt);
			if (fields.retryable !== true) return 'info';
			return streakLevel(fields.attempt);
		},
		// Only a retryable failure that persisted reaches a code. A 2xx whose body
		// could not be read (a host challenge page, PHP output) reached the store,
		// so "unreachable" would mislead; no status, 408 and 425 are the request
		// not getting an answer in time.
		code: (_event, fields) => {
			const status = typeof fields.status === 'number' ? fields.status : 0;
			if (status === 429) return ERROR_CODES.STORE_RATE_LIMITED;
			// A 428 that keeps coming back: the store demands a revision the till
			// cannot fetch, which the site admin has to look at.
			if (status === 428) return ERROR_CODES.STORE_SERVER_ERROR;
			if (status >= 500 || (status >= 200 && status < 300)) return ERROR_CODES.STORE_SERVER_ERROR;
			return ERROR_CODES.SYNC_UNREACHABLE;
		},
		message: recordMessage('push failed'),
	},
	// Fires only on a scope switch or dispose. The claimed row re-pushes on the
	// next drain and the server dedupes on mutationId, so nothing was lost.
	'push.aborted': {
		operationType: 'sync.record',
		outcome: 'cancelled',
		code: null,
		level: 'info',
		message: recordMessage('push aborted'),
	},
	'push.conflict': {
		// One push's 409, not the record's verdict. The drain settles it next: an
		// order re-anchors and re-pushes once (#1204) and lands as
		// conflict-recovered / conflict-overwrote-server; anything it cannot settle
		// parks as queue.write.conflict-transition, which carries SYNC221. Stamping
		// SYNC221 here told the cashier to "re-apply the values" for an order the
		// till had already saved (demo.wcpos.com, 2026-10-17).
		operationType: 'sync.record',
		outcome: 'unknown',
		code: null,
		level: 'info',
		message: recordMessage('push conflict'),
	},
	// Another writer holds the reservation or the record lock; the drain retries
	// with backoff and the lock usually frees. One that keeps holding is a wedged
	// reservation on the server, so it warns SYNC131 once it has persisted.
	'push.in_progress': {
		operationType: 'sync.record',
		outcome: 'failed',
		code: ERROR_CODES.STORE_SERVER_ERROR,
		level: (_event, fields) => streakLevel(fields.attempt),
		message: recordMessage('push already in progress'),
	},
	// The dead-letter verdict: the record parks for Store health. Error, the
	// severity of every code it maps to — and the level that reaches Sentry, now
	// that the push.error before it is an info attempt. A catalogue edit's dead
	// letter is stamped `revertPending` by the engine: an uncoded attempt, because
	// the revert decides the verdict — queue.write.auto-reverted when it lands, a
	// second push.rejected (`revertFailed`) at error when it does not.
	'push.rejected': {
		operationType: 'sync.record',
		outcome: 'rejected',
		level: (_event, fields) => (fields.revertPending === true ? 'info' : 'error'),
		// One mapping shared with the screen's toast (`pushFailureCode`), so the row and
		// the toast always give the same instruction for the same refusal.
		code: (_event, fields) => rejectedWriteCode(fields.status, fields.reason),
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
	//
	// A difference smaller than one minor currency unit (`roundingClass`
	// 'sub-cent': under 0.01 on every field) is float noise no customer was
	// charged, so it is info with no code (owner ruling 2026-10-17). The order's
	// own currency decimals do not reach the drain, so 0.01 is the unit.
	'push.money-divergence': {
		operationType: 'sync.money',
		outcome: 'failed',
		code: ERROR_CODES.TOTALS_DIVERGED,
		level: (_event, fields) => (fields.roundingClass === 'sub-cent' ? 'info' : 'error'),
		message: recordMessage('server totals differ from the till'),
	},
	// The store demanded a revision the till could not obtain, and the row parks
	// for the same Store health resolution as a conflict. There is no field to
	// fix, so SYNC211 sent the cashier looking for one.
	'queue.write.needs-revision': {
		operationType: 'sync.record',
		outcome: 'rejected',
		code: ERROR_CODES.RECORD_CONFLICT,
		message: recordMessage('needs revision'),
	},
	// The change is gone — the store's value was restored — so SYNC201's "saved
	// only on this device… fix the field, then retry" was false on every count.
	'queue.write.auto-reverted': {
		operationType: 'sync.record',
		outcome: 'recovered',
		code: ERROR_CODES.RECORD_REVERTED,
		level: 'warn',
		toast(event, fields) {
			// The server's human-readable message ("Sorry, you are not allowed to
			// edit this resource.", localized by WP) over the machine code.
			const reason = sanitizeReason(fields.serverMessage) ?? sanitizeReason(fields.reason);
			const detail = reason === undefined || reason.endsWith('.') ? reason : `${reason}.`;
			return {
				title: 'Change rejected by your store — reverted',
				description: detail
					? `${detail} See Store health for details.`
					: 'See Store health for details.',
			};
		},
		message: recordMessage('change reverted to server value; see Store health'),
	},
	// The order saved, but over a newer store edit to the listed fields: someone
	// may need to make that edit again in WP Admin.
	'queue.write.conflict-overwrote-server': {
		operationType: 'sync.record',
		outcome: 'recovered',
		code: ERROR_CODES.STORE_EDIT_OVERWRITTEN,
		level: 'warn',
		message: (event, fields) => {
			const overwrittenFields = Array.isArray(fields.overwrittenFields)
				? fields.overwrittenFields.filter((field) => typeof field === 'string')
				: [];
			const overwrittenCount = num(fields.overwrittenCount);
			const partial = overwrittenCount > overwrittenFields.length;
			return recordMessage(
				`overwrote ${overwrittenCount} store fields${partial ? ` (showing ${overwrittenFields.length})` : ''}: ${overwrittenFields.join(', ')}`
			)(event, fields);
		},
	},
	'queue.write.conflict-recovered': {
		// #1204: the clash SETTLED — the base was re-anchored to the store's own
		// revision and the same change saved. Nothing for the cashier to do, so no
		// error code and no toast: this row exists so support can see that an order
		// took the recovery path rather than sailing through first time.
		operationType: 'sync.record',
		outcome: 'recovered',
		code: null,
		level: 'info',
		message: recordMessage('conflict re-anchored and saved'),
	},
	'queue.write.conflict-transition': {
		operationType: 'sync.record',
		outcome: 'failed',
		code: ERROR_CODES.RECORD_CONFLICT,
		message: recordMessage('conflict transition failed'),
	},
	// The backoff write failed: the next drain re-pushes without the delay, and
	// the push.error before it reported the push failure. But with `attempts`
	// unpersisted that push.error never counts past attempt 1, so this row's own
	// streak (kept outside the queue row) is the verdict for storage that keeps
	// refusing the write.
	'queue.write.reschedule-failed': {
		operationType: 'sync.record',
		outcome: 'failed',
		code: (_event, fields) =>
			streakLevel(fields.consecutiveFailures) === 'warn' ? ERROR_CODES.LOCAL_DB_WRITE_FAILED : null,
		level: (_event, fields) => streakLevel(fields.consecutiveFailures),
		message: recordMessage('reschedule failed'),
	},
	// The push landed but recording it here failed; the next drain re-pushes and
	// the server dedupes. No push.error follows a push that landed, so a streak
	// of these is the only signal that this device cannot record its sends. Its
	// own code, never SYNC101: that one says "enter it again", which here would
	// create a second sale — the store already has this one.
	'queue.write.ack-failed': {
		operationType: 'sync.record',
		outcome: 'unknown',
		code: (_event, fields) =>
			streakLevel(fields.consecutiveFailures) === 'warn'
				? ERROR_CODES.RECORD_SENT_UNRECORDED
				: null,
		level: (_event, fields) => streakLevel(fields.consecutiveFailures),
		message: recordMessage('sent, but could not be recorded on this device'),
	},
	'queue.write.resolve': {
		operationType: 'sync.record',
		outcome: 'ok',
		code: null,
		message: recordMessage('conflict resolved'),
	},
	'queue.write.discard-repull-deferred': {
		operationType: 'sync.record',
		outcome: 'unknown',
		code: null,
		level: 'info',
		message: recordMessage('repull deferred'),
	},
	'queue.write.born-twice-requeue': {
		operationType: 'sync.record',
		outcome: 'unknown',
		code: null,
		level: 'info',
		message: recordMessage('requeued after duplicate create'),
	},
	'queue.write.drain': {
		operationType: 'sync.queue',
		outcome: 'ok',
		code: null,
		didWork: (f) => num(f.pushed) + num(f.conflicts) + num(f.failed) + num(f.rejected) > 0,
	},
	// An aggregate of background tasks: failed tasks retry after 30s by
	// themselves and lost claims are routine contention, so the row is info —
	// unless a task keeps failing with a cause no transport/deadline row reported
	// (a local failure after the fetch). Nothing else reports that, so it warns
	// SYNC401 once it has repeated over several drains.
	'queue.scheduler.drain': {
		operationType: 'sync.queue',
		outcome: 'ok',
		code: (_event, fields) =>
			num(fields.failedUnreported) > 0 ? ERROR_CODES.SYNC_TASK_CRASHED : null,
		level: (_event, fields) =>
			num(fields.failedUnreported) > 0 ? streakLevel(fields.consecutiveUnreportedFailures) : 'info',
		// Lost-work counters still count as work: they are the support evidence
		// for a slow server, now that no warn level carries them past the gate.
		didWork: (f) =>
			num(f.succeeded) +
				num(f.failed) +
				num(f.failureLost) +
				num(f.completionLost) +
				num(f.renewalLost) >
			0,
	},
	'queue.write.enqueued': { operationType: 'sync.queue', outcome: 'ok', code: null },
	'queue.write.annihilate': { operationType: 'sync.queue', outcome: 'ok', code: null },
	'queue.write.coalesce': { operationType: 'sync.queue', outcome: 'ok', code: null },
	// The write drain's next tick re-runs it, so a crash alarms only once it has
	// repeated (the lane stamps `consecutiveFailures`). Conflict resolution's
	// claim-release failure shares the type, carries no streak and stays info:
	// the claim frees itself at the lease deadline.
	'queue.write.tick.error': {
		operationType: 'sync.queue',
		outcome: 'failed',
		code: ERROR_CODES.SYNC_TASK_CRASHED,
		level: (_event, fields) => streakLevel(fields.consecutiveFailures),
	},
	// One row when the write drain starts holding a session the store refused
	// (401). Info: the auth layer already writes the verdict for the same 401 —
	// "Sync paused… sign in again" when the renewed session is refused, "Unable
	// to refresh session" when the refresh fails — and a second AUTH101 here
	// made one expired session read as two problems.
	'queue.write.session-refused': {
		operationType: 'sync.queue',
		outcome: 'failed',
		code: null,
		level: 'info',
	},
	'engine.listener-error': {
		operationType: 'sync.lifecycle',
		outcome: 'failed',
		code: ERROR_CODES.UNEXPECTED_ERROR,
	},

	// ————————————————————————————————————————————————————————————————————————
	// Explicit cashier-facing decisions for the 21 events that formerly inherited
	// the runtime default. Invisible rows remain available to diagnostics only.
	// ————————————————————————————————————————————————————————————————————————
	// decided: visible — reaching the hard cap leaves the cashier's list incomplete.
	// Info: the 100,000-row ceiling takes ten thousand scroll ticks to reach, so
	// hitting it means a corrupted limit (support evidence), and the window
	// simply stops growing — there is nothing for the merchant to do or lose.
	'browse-window.backstop-reached': {
		operationType: 'sync.coverage',
		outcome: 'unknown',
		code: null,
		level: 'info',
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
	// decided: invisible — per-request engine narration; its value is in artifacts,
	// where a started line with no outcome names a wedged requirement.
	'coverage.require.started': INVISIBLE,
	// decided: visible — a data request stopped making progress and was abandoned so
	// the rest of the queue could keep loading. The screen that asked re-declares
	// it, so one stall is info; stalls with nothing completing in between (a
	// storage promise that never settles, before any request) have no other row,
	// so they warn SYNC181 once they persist. SYNC321's "retry only the records
	// that failed" named a retry the cashier has no button for.
	'coverage.require.stalled': {
		operationType: 'sync.coverage',
		outcome: 'failed',
		code: ERROR_CODES.LOCAL_DB_STALLED,
		level: (_event, fields) => streakLevel(fields.consecutiveStalls),
	},
	// decided: invisible — the breadcrumb recording that an abandoned request
	// eventually settled; pure diagnostics narration.
	'coverage.require.stall-settled': INVISIBLE,
	// decided: visible — the requested customer ordering is unavailable to the cashier.
	// A 400 here is a store plugin predating #1488 (see the emitter), so the
	// instruction is the plugin update; the transport and coverage rows for the
	// same 400 stay quiet.
	'customer.browse-window.sort-rejected': {
		operationType: 'sync.coverage',
		outcome: 'rejected',
		code: ERROR_CODES.WCPOS_PLUGIN_OUTDATED,
		didWork: () => true,
	},
	// decided: invisible — the activity counter self-corrects without changing cashier work.
	'demand.activity-counter-underflow': INVISIBLE,
	// decided: visible — a sustained demand-path request flood means something on
	// this device is asking in a loop (#888 class); Store health is where support
	// looks first, and the #1134 item-2 ruling makes this detection-only, so the
	// row is the ENTIRE intervention. Outcome 'unknown' on purpose: the flood is
	// an anomaly observation, not a failed unit of work — nothing was blocked.
	'demand.flood-detected': {
		operationType: 'sync.coverage',
		outcome: 'unknown',
		code: ERROR_CODES.DEMAND_REQUEST_FLOOD,
		level: 'warn',
		didWork: () => true,
	},
	// decided: visible — missing barcode settings can degrade product scanning.
	// Info: the 5s hydrate timeout trips on any slow store, scans fall back to an
	// online lookup meanwhile, and the next config poll re-pulls the barcode
	// collections — so a warn here fired on every scope open of a slow store.
	'engine.barcode-selector-hydrate-failed': {
		operationType: 'sync.startup',
		outcome: 'failed',
		code: null,
		level: 'info',
		didWork: () => true,
	},
	// decided: invisible — scheduling a catch-up tick after reconnect is internal narration.
	'engine.reconnect.retick': INVISIBLE,
	// decided: visible — explains multi-tab degradation to support.
	// Info, and not CLIENT121: without Web Locks this tab becomes a writer of its
	// own (web-write-leader.ts), the opposite of "one tab syncs for all". Its
	// sales still send, and a second such tab is fenced by the drain's claim
	// lease and the server's mutationId dedupe — nothing for the merchant to do.
	'engine.write-leader.degraded': {
		operationType: 'sync.lifecycle',
		outcome: 'unknown',
		code: null,
		level: 'info',
		didWork: () => true,
	},
	// decided: visible — a crashed background lane is cashier-visible degradation until retry.
	// The lane re-runs on its next tick: a failed request is the transport/deadline
	// row's incident, and a local crash alarms once it has repeated.
	'maintenance.lane.error': {
		operationType: 'sync.lane',
		outcome: 'failed',
		// Status 0 is a request with no response at all: unreachable, not a crash.
		code: (_event, fields) =>
			fields.status === 0 ? ERROR_CODES.SYNC_UNREACHABLE : ERROR_CODES.SYNC_TASK_CRASHED,
		level: (_event, fields) =>
			requestReported(fields) ? 'info' : streakLevel(fields.consecutiveFailures),
		didWork: () => true,
	},
	// decided: invisible — routine maintenance summaries are background narration.
	'maintenance.lane.tick': INVISIBLE,
	// decided: visible — approximate catalogue totals explain incomplete-looking results.
	// Info: a lasting store capability the engine handles by design, written on
	// every walk, with nothing for the cashier to do.
	'product.browse-window.approximate': {
		operationType: 'sync.coverage',
		outcome: 'unknown',
		code: null,
		level: 'info',
		didWork: () => true,
	},
	// decided: visible — an unsupported brand filter changes the products the cashier sees.
	// Info for the same reason as the approximate row above.
	'product.browse-window.brand-filter-ignored': {
		operationType: 'sync.coverage',
		outcome: 'rejected',
		code: null,
		level: 'info',
		didWork: () => true,
	},
	// decided: visible — an unsaved rejection can leave a cashier's sale unrecoverable.
	'push.dead-letter-unpersisted': {
		operationType: 'sync.record',
		outcome: 'failed',
		code: ERROR_CODES.LOCAL_DB_WRITE_FAILED,
		didWork: () => true,
		message: recordMessage('rejected change could not be saved for recovery'),
	},
	// decided: invisible — periodic drain progress is high-volume loading narration.
	'queue.drain.progress': INVISIBLE,
	// decided: visible — rebuilding a refused write confirms the record is queued to retry.
	'queue.write.requeue-rebuilt': {
		operationType: 'sync.record',
		outcome: 'recovered',
		code: null,
		level: 'info',
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

/** The row's level: debug when invisible, else the table's call, else the emitter's. */
function rowLevel(
	conformance: Conformance | undefined,
	event: SyncEvent,
	fields: SyncEventFieldsBase
): SyncEvent['level'] {
	if (conformance?.visible === false) return 'debug';
	const level = conformance?.level;
	return (typeof level === 'function' ? level(event, fields) : level) ?? event.level;
}

/** Resolve the shared cashier-log error classification for a raw sync event. */
export function resolveSyncEventErrorCode(event: SyncEvent): ErrorCode | null {
	const fields = (event.fields ?? {}) as Record<string, unknown>;
	const conformance: Conformance = CONFORMANCE.get(event.type) ?? INHERITED_DEFAULT;
	const level = rowLevel(conformance, event, fields);
	if (level !== 'warn' && level !== 'error') return null;
	return typeof conformance.code === 'function'
		? conformance.code(event, fields)
		: conformance.code;
}

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
		const level = rowLevel(mapped, event, fields);
		const isFailure = level === 'warn' || level === 'error';

		// Tally BEFORE any gate, so successful attempts — which never persist — still
		// reach the aggregate.
		if (event.type === 'transport.request') {
			httpRequests += 1;
			const attemptMs = num(fields.durationMs);
			httpMs += attemptMs;
			if (attemptMs > httpMaxMs) httpMaxMs = attemptMs;
			if (requestReported(fields)) httpErrors += 1;
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
		const code = resolveSyncEventErrorCode(event);
		// The did-work gate only ever suppresses IDLE work. A warn/error event is
		// never idle, so it bypasses the gate entirely: an emitter may raise the
		// level on a signal its counters don't carry, and gating that would
		// silently drop exactly the lost-work evidence this observer exists to
		// preserve.
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
		//      otherwise routine drain, and an info transport row carries a failed
		//      status.
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
			// A request settled quietly (its incident is another row's to report) is
			// still a failed request: filtering by outcome must find it.
			else if (event.type === 'transport.request' && requestReported(fields)) outcome = 'failed';
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
		delete context.errorCode;
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
		// serverMessage is server-provided prose — same redaction contract as reason.
		if (fields.serverMessage !== undefined) {
			const serverMessage = sanitizeReason(fields.serverMessage);
			if (serverMessage === undefined) delete context.serverMessage;
			else context.serverMessage = serverMessage;
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
			context.direction =
				event.type === 'apply.escalation' || event.type === 'apply.escalation-cleared'
					? 'pull'
					: 'push';
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
			conformance.toast?.(event, { ...fields, ...(reason ? { reason } : {}) }),
			isFailure && code !== null ? code : undefined
		);
		// Presentation stays warn, but a lane crash still promotes the preceding
		// recorder evidence just as its original error-level row did.
		if (event.type === 'maintenance.lane.error') {
			void promoteRecorder('maintenance.lane.error');
		}
	};

	return { observe };
}
