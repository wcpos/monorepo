import type { SyncEvent, SyncObserver } from '@wcpos/sync-core';

import { normalizeSyncCollection } from './sync-status';

export type PersistLogRow = (
	level: 'info' | 'warn' | 'error',
	message: string,
	context: Record<string, unknown>
) => void;

const RATE_LIMIT_WINDOW_MS = 60_000;

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

/**
 * Info events worth a Logs-screen row, gated on "did work" so idle cycles write
 * nothing. Everything else at info/debug feeds metrics/status only.
 */
const ACTIVITY_ALLOWLIST: Record<string, (fields: Record<string, unknown>) => boolean> = {
	'apply.pull': (f) => num(f.applied) > 0,
	'apply.delete': (f) => num(f.applied) > 0,
	'apply.refetch': (f) => num(f.refetched) > 0,
	'queue.write.drain': (f) =>
		num(f.pushed) + num(f.conflicts) + num(f.failed) + num(f.rejected) > 0,
	'queue.scheduler.drain': (f) => num(f.succeeded) + num(f.failed) > 0,
	'coverage.existence-prime': () => true,
	'coverage.existence-reconcile': () => true,
	'engine.ready': () => true,
	'engine.scope-switched': () => true,
};

/**
 * Persistence policy for engine telemetry: every warn/error, plus allowlisted
 * activity summaries, rate-limited per (type, collection) with suppressed-count
 * folding. Pure event→persist mapping; the caller owns logger wiring and
 * engine-identity guarding.
 */
export function createSyncLogObserver(options: { persist: PersistLogRow; nowMs?: () => number }): {
	observe: SyncObserver;
	reset: () => void;
} {
	const nowMs = options.nowMs ?? Date.now;
	const windows = new Map<string, { startMs: number; suppressed: number }>();

	const observe: SyncObserver = (event: SyncEvent) => {
		const fields = (event.fields ?? {}) as Record<string, unknown>;
		const isFailure = event.level === 'warn' || event.level === 'error';
		const isActivity =
			event.level === 'info' &&
			// Own-property guard: bracket access on a plain object resolves inherited
			// members, so 'constructor'/'toString' etc. would otherwise pass the gate.
			Object.hasOwn(ACTIVITY_ALLOWLIST, event.type) &&
			ACTIVITY_ALLOWLIST[event.type](fields);
		if (!isFailure && !isActivity) return;

		// Normalize engine camelCase names (e.g. 'taxRates') to the snake_case the
		// rest of the app keys on, so engine-side and apply-side events for the same
		// collection share one rate-limit window and persist under one name.
		const collection =
			event.collection !== undefined ? normalizeSyncCollection(event.collection) : undefined;
		const key = `${event.type}|${collection ?? ''}`;
		const at = nowMs();
		const window = windows.get(key);
		if (window !== undefined && at - window.startMs < RATE_LIMIT_WINDOW_MS) {
			window.suppressed += 1;
			return;
		}
		const suppressed = window?.suppressed ?? 0;
		windows.set(key, { startMs: at, suppressed: 0 });

		options.persist(
			isFailure ? (event.level as 'warn' | 'error') : 'info',
			event.message ?? event.type,
			{
				type: event.type,
				...(collection !== undefined ? { collection } : {}),
				...fields,
				...(suppressed > 0 ? { suppressed } : {}),
			}
		);
	};

	return { observe, reset: () => windows.clear() };
}
