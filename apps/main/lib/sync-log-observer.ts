import type { SyncEvent, SyncObserver } from '@wcpos/sync-core';
import type { LogTerminalFields } from '@wcpos/utils/logger';

import { normalizeSyncCollection } from './sync-status';

export type PersistLogRow = (
	level: 'debug' | 'info' | 'warn' | 'error',
	message: string,
	context: Record<string, unknown>,
	terminal?: LogTerminalFields
) => void;

type Conformance = {
	/** operationType written to the row; groups units of work in the UI. */
	operationType: string;
	/** Terminal outcome for this event type. */
	outcome: NonNullable<LogTerminalFields['outcome']>;
	/** Return false to route this occurrence to the check ring instead of a row
	 *  (idle work). Omit to always persist. */
	didWork?: (fields: Record<string, unknown>) => boolean;
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
	message?: (event: SyncEvent, fields: Record<string, unknown>) => string;
	/**
	 * Debug-level occurrences of this type are forensic evidence (a transient
	 * failure the arc later settled, #899): persist them AT debug, which the
	 * logger routes to the flight recorder and — under verbose diagnostics —
	 * to a durable row. Types without this flag keep the hard debug drop below.
	 */
	forensic?: boolean;
};

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
	if (typeof value !== 'string') {
		if (typeof value !== 'number' && typeof value !== 'boolean') return undefined;
		value = String(value);
	}
	const sanitized = value
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
function recordIdOf(fields: Record<string, unknown>): unknown {
	return fields.recordId ?? fields.id;
}

function recordMessage(verb: string): Conformance['message'] {
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
 * Observer-side terminal-row policy. A Map makes event types sourced from data
 * unable to resolve inherited Object.prototype members.
 */
const CONFORMANCE = new Map<string, Conformance>([
	[
		'signal.cycle',
		{
			operationType: 'sync.cycle',
			outcome: 'ok',
			didWork: (f) => num(f.pulls) + num(f.deletes) > 0,
		},
	],
	['signal.cursor', { operationType: 'sync.cursor', outcome: 'unknown' }],
	['signal.tick.error', { operationType: 'sync.cycle', outcome: 'failed' }],
	[
		'engine.lane.tick',
		{
			operationType: 'sync.lane',
			outcome: 'ok',
			didWork: (f) =>
				f.status === 'error' ||
				num(f.pushed) + num(f.conflicts) + num(f.deferred) + num(f.failed) + num(f.rejected) > 0,
		},
	],
	['engine.ready', { operationType: 'sync.startup', outcome: 'ok' }],
	['engine.ready-failed', { operationType: 'sync.startup', outcome: 'failed' }],
	['engine.ready-stalled', { operationType: 'sync.startup', outcome: 'unknown' }],
	['engine.scope-switched', { operationType: 'sync.scope', outcome: 'ok' }],
	['engine.collection-reset', { operationType: 'sync.reset', outcome: 'ok' }],
	['engine.reset-needs-confirmation', { operationType: 'sync.reset', outcome: 'cancelled' }],
	['engine.disposed', { operationType: 'sync.lifecycle', outcome: 'ok' }],
	['engine.connectivity-error', { operationType: 'sync.lifecycle', outcome: 'failed' }],
	['engine.pos-bootstrap-error', { operationType: 'sync.startup', outcome: 'failed' }],
	['engine.guard', { operationType: 'sync.scope', outcome: 'cancelled' }],
	[
		'apply.pull',
		{ operationType: 'sync.apply', outcome: 'ok', didWork: (f) => num(f.applied) > 0 },
	],
	[
		'apply.delete',
		{ operationType: 'sync.apply', outcome: 'ok', didWork: (f) => num(f.applied) > 0 },
	],
	['apply.rebaseline', { operationType: 'sync.apply', outcome: 'ok' }],
	[
		'apply.refetch',
		{ operationType: 'sync.apply', outcome: 'ok', didWork: (f) => num(f.refetched) > 0 },
	],
	['apply.refresh', { operationType: 'sync.apply', outcome: 'ok' }],
	['apply.barcode-rederive', { operationType: 'sync.apply', outcome: 'ok' }],
	[
		'apply.escalation',
		{
			operationType: 'sync.record',
			outcome: 'failed',
			message: recordMessage('pull escalation'),
		},
	],
	[
		'coverage.require.outcome',
		{
			operationType: 'sync.coverage',
			outcome: 'ok',
			didWork: (f) => num(f.documents) > 0 || num(f.requests) > 0,
		},
	],
	['coverage.require.error', { operationType: 'sync.coverage', outcome: 'failed' }],
	['coverage.existence-prime', { operationType: 'sync.coverage', outcome: 'ok' }],
	[
		'coverage.existence-reconcile',
		{
			operationType: 'sync.coverage',
			outcome: 'ok',
			didWork: (f) => num(f.pruned) + num(f.pulled) + num(f.repulled) > 0,
		},
	],
	[
		'coverage.compacted',
		{
			// Emitted on every retention pass, including the common no-op one; without
			// this gate an idle terminal writes a recurring 'ok' row that records no work.
			operationType: 'sync.coverage',
			outcome: 'ok',
			didWork: (f) => num(f.removed) > 0,
		},
	],
	['coverage.ledger-rebuilt', { operationType: 'sync.coverage', outcome: 'recovered' }],
	[
		'transport.request',
		{
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
	],
	[
		'push.outcome',
		{
			operationType: 'sync.record',
			outcome: 'ok',
			message: recordMessage('push completed'),
		},
	],
	[
		'push.error',
		{
			operationType: 'sync.record',
			outcome: 'failed',
			message: recordMessage('push failed'),
		},
	],
	[
		'push.aborted',
		{
			operationType: 'sync.record',
			outcome: 'cancelled',
			message: recordMessage('push aborted'),
		},
	],
	[
		'push.conflict',
		{
			operationType: 'sync.record',
			outcome: 'failed',
			message: recordMessage('push conflict'),
		},
	],
	[
		'push.in_progress',
		{
			operationType: 'sync.record',
			outcome: 'failed',
			message: recordMessage('push already in progress'),
		},
	],
	[
		'push.rejected',
		{
			operationType: 'sync.record',
			outcome: 'rejected',
			message: recordMessage('rejected by server'),
		},
	],
	[
		'queue.write.needs-revision',
		{
			operationType: 'sync.record',
			outcome: 'rejected',
			message: recordMessage('needs revision'),
		},
	],
	[
		'queue.write.conflict-transition',
		{
			operationType: 'sync.record',
			outcome: 'failed',
			message: recordMessage('conflict transition failed'),
		},
	],
	[
		'queue.write.reschedule-failed',
		{
			operationType: 'sync.record',
			outcome: 'failed',
			message: recordMessage('reschedule failed'),
		},
	],
	[
		'queue.write.resolve',
		{
			operationType: 'sync.record',
			outcome: 'ok',
			message: recordMessage('conflict resolved'),
		},
	],
	[
		'queue.write.discard-repull-deferred',
		{
			operationType: 'sync.record',
			outcome: 'unknown',
			message: recordMessage('repull deferred'),
		},
	],
	[
		'queue.write.born-twice-requeue',
		{
			operationType: 'sync.record',
			outcome: 'unknown',
			message: recordMessage('requeued after duplicate create'),
		},
	],
	[
		'queue.write.drain',
		{
			operationType: 'sync.queue',
			outcome: 'ok',
			didWork: (f) => num(f.pushed) + num(f.conflicts) + num(f.failed) + num(f.rejected) > 0,
		},
	],
	[
		'queue.scheduler.drain',
		{
			operationType: 'sync.queue',
			outcome: 'ok',
			didWork: (f) => num(f.succeeded) + num(f.failed) > 0,
		},
	],
	['queue.write.enqueued', { operationType: 'sync.queue', outcome: 'ok' }],
	['queue.write.annihilate', { operationType: 'sync.queue', outcome: 'ok' }],
	['queue.write.coalesce', { operationType: 'sync.queue', outcome: 'ok' }],
	['queue.write.tick.error', { operationType: 'sync.queue', outcome: 'failed' }],
	['engine.listener-error', { operationType: 'sync.lifecycle', outcome: 'failed' }],
]);

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
		const isFailure = event.level === 'warn' || event.level === 'error';

		// Tally BEFORE any gate, so successful attempts — which never persist — still
		// reach the aggregate.
		if (event.type === 'transport.request') {
			httpRequests += 1;
			const attemptMs = num(fields.durationMs);
			httpMs += attemptMs;
			if (attemptMs > httpMaxMs) httpMaxMs = attemptMs;
			if (fields.status === 0 || num(fields.status) >= 400) httpErrors += 1;
		}

		// Debug narration never becomes a durable row (spec §1: "Debug never persists
		// otherwise") — it belongs to the flight recorder. The one exception is a
		// mapped type marked `forensic` (#899): those debug occurrences ARE forwarded,
		// at debug — the logger routes them to the recorder ring and only persists
		// them under verbose diagnostics. Everything else keeps the hard drop, so a
		// mapped type that later gains a debug emit is never silently relabelled as
		// `info`.
		if (event.level === 'debug' && mapped?.forensic !== true) return;

		if (mapped === undefined && !isFailure) return;
		const conformance =
			mapped ?? ({ operationType: 'sync.other', outcome: 'failed' } satisfies Conformance);
		// The did-work gate only ever suppresses IDLE work. A warn/error event is
		// never idle, so it bypasses the gate entirely: several emitters raise the
		// level on a signal their counters don't carry — `queue.scheduler.drain`
		// goes to `error` on completionLost/failureLost/renewalLost while
		// `succeeded` and `failed` are both 0 — and gating those would silently
		// drop exactly the lost-work evidence this observer exists to preserve.
		if (conformance.didWork && !isFailure && !conformance.didWork(fields)) return;

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
		if (conformance.operationType === 'sync.record') {
			context.direction = event.type === 'apply.escalation' ? 'pull' : 'push';
			const recordId = recordIdOf(fields);
			if (recordId !== undefined && context.recordId === undefined) context.recordId = recordId;
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
			isFailure ? event.level : event.level === 'debug' ? 'debug' : 'info',
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
			}
		);
	};

	return { observe };
}
