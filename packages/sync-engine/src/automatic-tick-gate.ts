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
	const run = async (tick: () => Promise<SyncReport>): Promise<void> => {
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
		options.recordTick(await tick(), startedAtMs);
	};
	const runLane = (lane: EngineLane): Promise<void> => run(() => options.tickLane(lane));
	return { run, runLane };
}
