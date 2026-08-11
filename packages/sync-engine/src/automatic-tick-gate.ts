import type { SyncObserver } from '@wcpos/sync-core';

import type { EngineConnectivity, EngineLane, SyncReport } from './create-rxdb-sync-engine';

export type AutomaticTickGate = {
	run(tick: () => Promise<SyncReport>): Promise<void>;
	runLane(lane: EngineLane): Promise<void>;
};

export function createAutomaticTickGate(options: {
	isGated: () => boolean;
	connectivity: () => EngineConnectivity;
	now: () => number;
	diagnostics: SyncObserver;
	onStatusChange: () => void;
	tickLane: (lane: EngineLane) => Promise<SyncReport>;
	recordTick: (report: SyncReport, startedAtMs: number) => void;
	seedRetickLanes: readonly EngineLane[];
}): AutomaticTickGate {
	let lastAutomaticConnectivity: EngineConnectivity | undefined;
	let reconnectRetick: Promise<void> | null = null;
	const laneRuns = new Map<EngineLane, Promise<void>>();
	const run = async (tick: () => Promise<SyncReport>, lane?: EngineLane): Promise<void> => {
		if (options.isGated()) return;
		const connectivityNow = options.connectivity();
		const reconnected = lastAutomaticConnectivity === 'offline' && connectivityNow === 'online';
		if (lastAutomaticConnectivity !== undefined && lastAutomaticConnectivity !== connectivityNow) {
			options.onStatusChange();
		}
		lastAutomaticConnectivity = connectivityNow;
		if (reconnected && reconnectRetick === null) {
			options.diagnostics({ type: 'engine.reconnect.retick', level: 'info' });
			reconnectRetick = Promise.all(options.seedRetickLanes.map((lane) => runLane(lane)))
				.then(() => runLane('scheduler-drain'))
				.then(() => runLane('write-drain'))
				.then(() => undefined);
			void reconnectRetick.then(
				() => {
					reconnectRetick = null;
				},
				() => {
					reconnectRetick = null;
				}
			);
		}
		const startedAtMs = options.now();
		try {
			options.recordTick(await tick(), startedAtMs);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			options.diagnostics({
				type: 'engine.lane.tick',
				level: 'error',
				message: `automatic tick failed: ${message}`,
				fields: {
					...(lane === undefined ? {} : { lane }),
					status: 'error',
					durationMs: options.now() - startedAtMs,
				},
			});
		}
	};
	const runLane = (lane: EngineLane): Promise<void> => {
		const active = laneRuns.get(lane);
		if (active !== undefined) return active;
		// Reserve the lane BEFORE the tick starts (codex r3760800569): run()'s synchronous
		// prefix can itself re-enter runLane for this lane (a reconnect observed by a seed
		// timer starts the retick chain synchronously). A pre-registered proxy makes the
		// reservation visible to any such re-entry while the tick still starts synchronously.
		let settle!: (outcome: Promise<void>) => void;
		const proxy = new Promise<void>((resolve, reject) => {
			settle = (outcome) => {
				void outcome.then(resolve, reject);
			};
		});
		laneRuns.set(lane, proxy);
		settle(run(() => options.tickLane(lane), lane));
		const started = proxy;
		void started.then(
			() => laneRuns.delete(lane),
			() => laneRuns.delete(lane)
		);
		return started;
	};
	return { run, runLane };
}
