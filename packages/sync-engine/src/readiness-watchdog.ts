import type { SyncObserver } from '@wcpos/sync-core';

import { type EngineTimers, systemTimers } from './engine-timers';

const READY_STALL_FIRST_MS = 15_000;
const READY_STALL_REPEAT_MS = 60_000;

export type ReadinessWatchdog = { stop(): void };

export function armReadinessWatchdog(options: {
	ready: Promise<unknown>;
	phase: () => { phase: string; sinceMs: number };
	now: () => number;
	diagnostics: SyncObserver;
	timers?: EngineTimers;
	firstStallMs?: number;
	repeatStallMs?: number;
}): ReadinessWatchdog {
	const timers = options.timers ?? systemTimers;
	const armedAtMs = options.now();
	let timer: ReturnType<typeof setTimeout> | null = null;
	const stop = (): void => {
		if (timer !== null) timers.clearTimeout(timer);
		timer = null;
	};
	const emitStalled = (): void => {
		const phase = options.phase();
		const elapsedMs = options.now() - armedAtMs;
		const phaseElapsedMs = options.now() - phase.sinceMs;
		options.diagnostics({
			type: 'engine.ready-stalled',
			level: 'error',
			message: `sync engine initial open not ready after ${elapsedMs}ms — waiting on "${phase.phase}" for ${phaseElapsedMs}ms`,
			fields: { phase: phase.phase, elapsedMs, phaseElapsedMs },
		});
		timer = timers.setTimeout(emitStalled, options.repeatStallMs ?? READY_STALL_REPEAT_MS);
		timers.unref(timer);
	};
	timer = timers.setTimeout(emitStalled, options.firstStallMs ?? READY_STALL_FIRST_MS);
	timers.unref(timer);
	void options.ready.then(
		() => {
			stop();
			options.diagnostics({
				type: 'engine.ready',
				level: 'info',
				message: 'sync engine ready',
				fields: { durationMs: options.now() - armedAtMs },
			});
		},
		(error) => {
			stop();
			const phase = options.phase();
			options.diagnostics({
				type: 'engine.ready-failed',
				level: 'error',
				message: `sync engine initial open failed in phase "${phase.phase}": ${error instanceof Error ? error.message : String(error)}`,
				fields: { phase: phase.phase, elapsedMs: options.now() - armedAtMs },
			});
		}
	);
	return { stop };
}
