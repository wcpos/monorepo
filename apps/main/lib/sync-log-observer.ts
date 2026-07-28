import type { SyncEvent, SyncObserver } from '@wcpos/sync-core';
import type { LogTerminalFields } from '@wcpos/utils/logger';

import { normalizeSyncCollection } from './sync-status';

export type PersistLogRow = (
	level: 'info' | 'warn' | 'error',
	message: string,
	context: Record<string, unknown>,
	terminal?: LogTerminalFields
) => void;

type Conformance = {
	/** operationType written to the row; groups units of work in the UI. */
	operationType: string;
	/** Terminal outcome for this event type. */
	outcome: 'ok' | 'failed' | 'rejected' | 'cancelled' | 'unknown';
	/** Return false to route this occurrence to the check ring instead of a row
	 *  (idle work). Omit to always persist. */
	didWork?: (fields: Record<string, unknown>) => boolean;
	/** Plain-language row message. Falls back to event.message ?? event.type. */
	message?: (event: SyncEvent, fields: Record<string, unknown>) => string;
};

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

function recordMessage(verb: string): Conformance['message'] {
	return (event, fields) => {
		const recordId = fields.recordId;
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
	['coverage.compacted', { operationType: 'sync.coverage', outcome: 'ok' }],
	[
		'transport.request',
		{
			operationType: 'sync.http',
			outcome: 'ok',
			didWork: (f) => f.status === 0 || num(f.status) >= 400 || num(f.bytes) > 0,
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
	const observe: SyncObserver = (event: SyncEvent) => {
		const fields = (event.fields ?? {}) as Record<string, unknown>;
		const mapped = CONFORMANCE.get(event.type);
		const isFailure = event.level === 'warn' || event.level === 'error';
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
		let outcome = conformance.outcome;
		if (event.type === 'engine.lane.tick' && fields.status === 'error') outcome = 'failed';
		if (event.type === 'transport.request' && event.level !== 'info') outcome = 'failed';
		if (event.type === 'queue.scheduler.drain' && event.level === 'error') outcome = 'failed';

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
		if (fields.reason !== undefined) {
			if (reason === undefined) delete context.reason;
			else context.reason = reason;
		}
		if (conformance.operationType === 'sync.record') {
			context.direction = event.type === 'apply.escalation' ? 'pull' : 'push';
		}

		options.persist(
			isFailure ? event.level : 'info',
			conformance.message?.(event, { ...fields, ...(reason ? { reason } : {}) }) ??
				event.message ??
				event.type,
			context,
			{
				operationType: conformance.operationType,
				outcome,
				...(durationMs !== undefined
					? { durationMs, startedAt: (event.at ?? nowMs()) - durationMs }
					: {}),
			}
		);
	};

	return { observe };
}
