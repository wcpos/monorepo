import type { SyncObserver } from '@wcpos/sync-core';

import {
	type ChangeSignalDecayLevel,
	changeSignalDelayMs,
	changeSignalSteadyIntervalMs,
	maxChangeSignalPressureMultiplier,
	nextChangeSignalDecayLevel,
} from './change-signal/tick-cadence';
import { type EngineTimers, systemTimers } from './engine-timers';
import {
	INTERVAL_LANES,
	type LaneIntervalKey,
	laneRegistryEntry,
} from './maintenance/lane-registry';

import type {
	ServerPressureMonitor,
	ServerPressureTransition,
} from './change-signal/server-pressure';
import type { AutomaticTickGate } from './automatic-tick-gate';
import type { EngineLane } from './create-rxdb-sync-engine';

export type CadenceController = {
	start(): void;
	reconfigure(config: { changeSignalPollMs?: number; pullBatchSize?: number }): void;
	pullBatchSize(): number | undefined;
	nextDueAtMs(lane: EngineLane): number | undefined;
	onServerPressureTransition(transition: ServerPressureTransition): void;
	effectiveCadenceMs(input?: {
		level?: ChangeSignalDecayLevel;
		pressureMultiplier?: number;
	}): number;
	stop(): void;
};

export function createCadenceController(options: {
	mode: 'auto' | 'manual';
	intervals: Record<LaneIntervalKey, number>;
	pressure: ServerPressureMonitor;
	now: () => number;
	random: () => number;
	diagnostics: SyncObserver;
	timers?: EngineTimers;
	onStatusChange: () => void;
	gate: AutomaticTickGate;
	startedAtMs: number;
	isDisposed: () => boolean;
	lastUserActivityMs?: () => number;
	onUserActivity?: (listener: () => void) => () => void;
	hostVisible?: () => boolean;
	onHostVisibilityChange?: (listener: (visible: boolean) => void) => () => void;
	laneIsArmable: (lane: EngineLane) => boolean;
}): CadenceController {
	const timers = options.timers ?? systemTimers;
	let changeSignalTimer: ReturnType<typeof setTimeout> | null = null;
	let changeSignalDecayLevel: ChangeSignalDecayLevel = 0;
	let unsubscribeUserActivity: (() => void) | null = null;
	let unsubscribeHostVisibility: (() => void) | null = null;
	let writeDrainTimer: ReturnType<typeof setInterval> | null = null;
	const maintenanceTimers = new Map<EngineLane, ReturnType<typeof setInterval>>();
	const laneNextDueAtMs = new Map<EngineLane, number>();
	let pullBatchSize: number | undefined;
	let cadenceStartAnnounced = false;
	let started = false;
	let stopped = false;
	options.pressure.setMaxMultiplier(
		maxChangeSignalPressureMultiplier(options.intervals.changeSignalPollMs)
	);

	const effectiveCadenceMs: CadenceController['effectiveCadenceMs'] = (input) =>
		changeSignalSteadyIntervalMs({
			tierMs: options.intervals.changeSignalPollMs,
			level: input?.level ?? changeSignalDecayLevel,
			pressureMultiplier: input?.pressureMultiplier ?? options.pressure.multiplier(),
		});
	const emitCadenceStart = (): void => {
		options.diagnostics({
			type: 'cadence.start',
			level: 'info',
			message: `change-signal polling every ${Math.round(effectiveCadenceMs() / 1000)}s`,
			fields: {
				intervalMs: effectiveCadenceMs(),
				tierMs: options.intervals.changeSignalPollMs,
				pressureMultiplier: options.pressure.multiplier(),
				...(pullBatchSize === undefined ? {} : { pullBatchSize }),
			},
		});
	};
	const armChangeSignalTimer = (armOptions?: { neverEarlierThanArmed?: boolean }): void => {
		if (stopped || options.isDisposed()) return;
		const now = options.now();
		const previouslyDueAtMs = laneNextDueAtMs.get('change-signal');
		const lastActivityMs = options.lastUserActivityMs?.() ?? options.startedAtMs;
		const idleForMs = Math.max(
			0,
			now - (lastActivityMs > 0 ? lastActivityMs : options.startedAtMs)
		);
		changeSignalDecayLevel =
			options.hostVisible?.() === false
				? 2
				: nextChangeSignalDecayLevel({
						idleForMs,
						currentLevel: changeSignalDecayLevel,
					});
		const drawn = changeSignalDelayMs({
			tierMs: options.intervals.changeSignalPollMs,
			level: changeSignalDecayLevel,
			pressureMultiplier: options.pressure.multiplier(),
			retryAfterForMs: Math.max(0, options.pressure.retryAfterUntilMs() - now),
			random: options.random,
		});
		const delay =
			armOptions?.neverEarlierThanArmed === true && previouslyDueAtMs !== undefined
				? Math.max(drawn, previouslyDueAtMs - now)
				: drawn;
		laneNextDueAtMs.set('change-signal', now + delay);
		options.onStatusChange();
		if (!cadenceStartAnnounced) {
			cadenceStartAnnounced = true;
			emitCadenceStart();
		}
		changeSignalTimer = timers.setTimeout(() => {
			armChangeSignalTimer();
			void options.gate.runLane('change-signal');
		}, delay);
	};
	const armLaneInterval = (
		lane: EngineLane,
		intervalMs: number
	): ReturnType<typeof setInterval> => {
		laneNextDueAtMs.set(lane, options.now() + intervalMs);
		options.onStatusChange();
		return timers.setInterval(() => {
			laneNextDueAtMs.set(lane, (laneNextDueAtMs.get(lane) ?? options.now()) + intervalMs);
			options.onStatusChange();
			void options.gate.runLane(lane);
		}, intervalMs);
	};
	const onServerPressureTransition = (transition: ServerPressureTransition): void => {
		if (options.mode === 'manual') return;
		const level = changeSignalDecayLevel;
		options.diagnostics({
			type: transition.direction === 'backoff' ? 'cadence.backoff' : 'cadence.recovered',
			level: 'info',
			message:
				transition.direction === 'backoff'
					? `slowed change-signal polling (${transition.signal})`
					: 'restored change-signal polling',
			fields: {
				signal: transition.signal,
				tierMs: options.intervals.changeSignalPollMs,
				fromIntervalMs: effectiveCadenceMs({
					level,
					pressureMultiplier: transition.fromMultiplier,
				}),
				toIntervalMs: effectiveCadenceMs({
					level,
					pressureMultiplier: transition.toMultiplier,
				}),
				pressureMultiplier: transition.toMultiplier,
				...(transition.retryAfterUntilMs === undefined
					? {}
					: { retryAfterMs: Math.max(0, transition.retryAfterUntilMs - options.now()) }),
				...(transition.serverLoad1m === undefined ? {} : { serverLoad1m: transition.serverLoad1m }),
				...(transition.serverLoadBaseline1m === undefined
					? {}
					: { serverLoadBaseline1m: transition.serverLoadBaseline1m }),
				...(transition.direction === 'recovery' && transition.toMultiplier === 1
					? { outcome: 'recovered' as const }
					: {}),
			},
		});
		if (transition.direction !== 'backoff') return;
		if (stopped || options.isDisposed() || changeSignalTimer === null) return;
		timers.clearTimeout(changeSignalTimer);
		armChangeSignalTimer({ neverEarlierThanArmed: true });
	};
	const reconfigure: CadenceController['reconfigure'] = (config) => {
		if (options.isDisposed()) throw new Error('RxdbSyncEngine is disposed');
		const fromBatchSize = pullBatchSize;
		const fromIntervalMs = effectiveCadenceMs();
		if (config.pullBatchSize !== undefined) {
			if (!Number.isFinite(config.pullBatchSize)) {
				throw new TypeError('pullBatchSize must be a finite number');
			}
			pullBatchSize = Math.min(100, Math.max(10, Math.trunc(config.pullBatchSize)));
		}
		const batchSizeChanged = pullBatchSize !== fromBatchSize;
		const emitBatchOnlyChange = (): void => {
			if (!batchSizeChanged || fromBatchSize === undefined) return;
			options.diagnostics({
				type: 'cadence.reconfigured',
				level: 'info',
				message: `change-signal batch size set to ${pullBatchSize} records`,
				fields: {
					tierMs: options.intervals.changeSignalPollMs,
					fromIntervalMs,
					toIntervalMs: effectiveCadenceMs(),
					pressureMultiplier: options.pressure.multiplier(),
					...(pullBatchSize === undefined ? {} : { pullBatchSize }),
				},
			});
		};
		if (config.changeSignalPollMs === undefined) {
			emitBatchOnlyChange();
			options.onStatusChange();
			return;
		}
		if (!Number.isFinite(config.changeSignalPollMs)) {
			throw new TypeError('changeSignalPollMs must be a finite number');
		}
		const nextPollMs = Math.min(300_000, Math.max(5_000, Math.trunc(config.changeSignalPollMs)));
		if (nextPollMs === options.intervals.changeSignalPollMs) {
			emitBatchOnlyChange();
			options.onStatusChange();
			return;
		}
		options.intervals.changeSignalPollMs = nextPollMs;
		options.pressure.setMaxMultiplier(maxChangeSignalPressureMultiplier(nextPollMs));
		options.diagnostics({
			type: 'cadence.reconfigured',
			level: 'info',
			message: `change-signal cadence set to ${Math.round(nextPollMs / 1000)}s`,
			fields: {
				tierMs: nextPollMs,
				fromIntervalMs,
				toIntervalMs: effectiveCadenceMs({ level: 0 }),
				pressureMultiplier: options.pressure.multiplier(),
				...(pullBatchSize === undefined ? {} : { pullBatchSize }),
			},
		});
		if (options.mode === 'manual' || changeSignalTimer === null) {
			options.onStatusChange();
			return;
		}
		timers.clearTimeout(changeSignalTimer);
		changeSignalDecayLevel = 0;
		armChangeSignalTimer();
		options.onStatusChange();
	};
	const start = (): void => {
		if (options.mode !== 'auto' || started || stopped || options.isDisposed()) return;
		started = true;
		armChangeSignalTimer();
		const restoreFullCadence = (): void => {
			if (stopped || options.isDisposed() || changeSignalTimer === null) return;
			changeSignalDecayLevel = 0;
			timers.clearTimeout(changeSignalTimer);
			armChangeSignalTimer();
			if (
				options.pressure.multiplier() > 1 ||
				options.pressure.retryAfterUntilMs() > options.now()
			) {
				return;
			}
			void options.gate.runLane('change-signal');
		};
		if (options.onUserActivity !== undefined) {
			unsubscribeUserActivity = options.onUserActivity(() => {
				if (changeSignalDecayLevel === 0) return;
				restoreFullCadence();
			});
		}
		if (options.onHostVisibilityChange !== undefined) {
			unsubscribeHostVisibility = options.onHostVisibilityChange((visible) => {
				if (!visible) {
					let statusChanged = false;
					for (const [lane, timer] of maintenanceTimers) {
						if (laneRegistryEntry(lane).runsWhileHidden) continue;
						timers.clearInterval(timer);
						maintenanceTimers.delete(lane);
						laneNextDueAtMs.delete(lane);
						statusChanged = true;
					}
					if (statusChanged) options.onStatusChange();
					return;
				}

				restoreFullCadence();
				for (const lane of INTERVAL_LANES) {
					const entry = laneRegistryEntry(lane);
					if (
						entry.runsWhileHidden ||
						lane === 'write-drain' ||
						maintenanceTimers.has(lane) ||
						!options.laneIsArmable(lane)
					) {
						continue;
					}
					maintenanceTimers.set(lane, armLaneInterval(lane, options.intervals[entry.intervalKey]));
				}
			});
		}
		for (const lane of INTERVAL_LANES) {
			if (!options.laneIsArmable(lane)) continue;
			if (options.hostVisible?.() === false && !laneRegistryEntry(lane).runsWhileHidden) continue;
			if (lane === 'query-total-retry') void options.gate.runLane(lane);
			const timer = armLaneInterval(lane, options.intervals[laneRegistryEntry(lane).intervalKey]);
			if (lane === 'write-drain') writeDrainTimer = timer;
			else maintenanceTimers.set(lane, timer);
		}
	};
	const stop = (): void => {
		if (stopped) return;
		stopped = true;
		if (changeSignalTimer !== null) timers.clearTimeout(changeSignalTimer);
		changeSignalTimer = null;
		unsubscribeUserActivity?.();
		unsubscribeUserActivity = null;
		unsubscribeHostVisibility?.();
		unsubscribeHostVisibility = null;
		if (writeDrainTimer !== null) timers.clearInterval(writeDrainTimer);
		writeDrainTimer = null;
		for (const timer of maintenanceTimers.values()) timers.clearInterval(timer);
		maintenanceTimers.clear();
		laneNextDueAtMs.clear();
		options.onStatusChange();
	};
	return {
		start,
		reconfigure,
		pullBatchSize: () => pullBatchSize,
		nextDueAtMs: (lane) => laneNextDueAtMs.get(lane),
		onServerPressureTransition,
		effectiveCadenceMs,
		stop,
	};
}
