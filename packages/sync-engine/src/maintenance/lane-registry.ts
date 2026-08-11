/** The single source of lane identity, cadence, ordering, dispatch, and activity ownership. */
// prettier-ignore
export const LANE_REGISTRY = [
	// Follow-up: these demand/cashier paths do not yet have a request ceiling.
	{ laneName: 'change-signal', intervalKey: 'changeSignalPollMs', defaultMs: 10_000, targetKey: 'changeSignal', owner: 'facade', collections: [], manualSync: true, seedRetickOrder: null, rebaselineOrder: null, timerOrder: null, maxRequestsPerTick: null },
	{ laneName: 'write-drain', intervalKey: 'writeDrainPollMs', defaultMs: 10_000, targetKey: 'writeDrain', owner: 'facade', collections: [], manualSync: true, seedRetickOrder: null, rebaselineOrder: null, timerOrder: 1, maxRequestsPerTick: null },
	// Seed ticks only enqueue. Reconcile is 3 scan ports × 3 gap-skipping pages + 2 drill-downs; query-total is 9 census probes + 1 due request.
	{ laneName: 'order-window-seed', intervalKey: 'orderWindowSeedMs', defaultMs: 5 * 60_000, targetKey: 'orderWindowSeed', owner: 'maintenance', collections: ['orders'], manualSync: true, seedRetickOrder: 3, rebaselineOrder: null, timerOrder: 3, maxRequestsPerTick: 0 },
	{ laneName: 'product-browse-window-seed', intervalKey: 'productBrowseWindowSeedMs', defaultMs: 5 * 60_000, targetKey: 'productBrowseWindowSeed', owner: 'maintenance', collections: ['products'], manualSync: true, seedRetickOrder: 2, rebaselineOrder: 1, timerOrder: 4, maxRequestsPerTick: 0 },
	{ laneName: 'reference-seed', intervalKey: 'referenceSeedMs', defaultMs: 5 * 60_000, targetKey: 'referenceSeed', owner: 'maintenance', collections: ['categories', 'brands', 'tags', 'coupons'], manualSync: true, seedRetickOrder: 1, rebaselineOrder: null, timerOrder: 5, maxRequestsPerTick: 0 },
	{ laneName: 'scheduler-drain', intervalKey: 'schedulerDrainMs', defaultMs: 30_000, targetKey: 'schedulerDrain', owner: 'maintenance', collections: [], manualSync: true, seedRetickOrder: null, rebaselineOrder: 2, timerOrder: 2, maxRequestsPerTick: 100 },
	{ laneName: 'query-total-retry', intervalKey: 'queryTotalRetryScanMs', defaultMs: 30_000, targetKey: 'queryTotalRetry', owner: 'maintenance', collections: [], manualSync: true, seedRetickOrder: null, rebaselineOrder: null, timerOrder: 7, maxRequestsPerTick: 10 },
	{ laneName: 'customer-trickle', intervalKey: 'customerTrickleMs', defaultMs: 5 * 60_000, targetKey: 'customerTrickle', owner: 'maintenance', collections: [], manualSync: false, seedRetickOrder: null, rebaselineOrder: null, timerOrder: 6, maxRequestsPerTick: 1 },
	{ laneName: 'coverage-compaction', intervalKey: 'coverageCompactionScanMs', defaultMs: 60_000, targetKey: 'coverageCompaction', owner: 'maintenance', collections: [], manualSync: true, seedRetickOrder: null, rebaselineOrder: null, timerOrder: 8, maxRequestsPerTick: 0 },
	{ laneName: 'existence-prime', intervalKey: 'existencePrimeMs', defaultMs: 15 * 60_000, targetKey: 'existencePrime', owner: 'maintenance', collections: [], manualSync: true, seedRetickOrder: null, rebaselineOrder: 3, timerOrder: 9, maxRequestsPerTick: 5 },
	{ laneName: 'existence-reconcile', intervalKey: 'existenceReconcileMs', defaultMs: 17 * 60_000, targetKey: 'existenceReconcile', owner: 'maintenance', collections: [], manualSync: true, seedRetickOrder: null, rebaselineOrder: 4, timerOrder: 10, maxRequestsPerTick: 11 },
] as const;

export type LaneRegistryEntry = (typeof LANE_REGISTRY)[number];
export type EngineLaneName = LaneRegistryEntry['laneName'];
export type LaneIntervalKey = LaneRegistryEntry['intervalKey'];
export type LaneTargetKey = LaneRegistryEntry['targetKey'];
export type MaintenanceLaneRegistryEntry = Extract<LaneRegistryEntry, { owner: 'maintenance' }>;
export type MaintenanceLaneName = MaintenanceLaneRegistryEntry['laneName'];

export const DEFAULT_LANE_INTERVALS = Object.fromEntries(
	LANE_REGISTRY.map(({ intervalKey, defaultMs }) => [intervalKey, defaultMs])
) as Record<LaneIntervalKey, number>;

export function laneRegistryEntry(name: EngineLaneName): LaneRegistryEntry {
	return LANE_REGISTRY.find((entry) => entry.laneName === name)!;
}

function orderedLanes(order: 'seedRetickOrder' | 'rebaselineOrder' | 'timerOrder') {
	return LANE_REGISTRY.filter((entry) => entry[order] !== null)
		.sort((left, right) => left[order]! - right[order]!)
		.map((entry) => entry.laneName);
}

export const MANUAL_SYNC_LANES: readonly EngineLaneName[] = LANE_REGISTRY.filter(
	(entry) => entry.manualSync
).map((entry) => entry.laneName);
export const SEED_RETICK_LANES: readonly EngineLaneName[] = orderedLanes('seedRetickOrder');
export const REBASELINE_RETICK_LANES: readonly EngineLaneName[] = orderedLanes('rebaselineOrder');
export const INTERVAL_LANES: readonly EngineLaneName[] = orderedLanes('timerOrder');
