import {
	STORAGE_TIMING_PROBE_ENABLED,
	takeStorageTimingSnapshot,
} from '@wcpos/database/plugins/storage-timing-probe';
import { startJsThreadLagSampler, takeJsThreadLagSnapshot } from '@wcpos/utils/js-thread-lag';
import { getLogger } from '@wcpos/utils/logger';
export { STORAGE_TIMING_PROBE_ENABLED };
export const STORAGE_TIMING_REPORT_INTERVAL_MS = 60_000; // One row a minute is readable in the Logs screen and negligible write load.
const STORAGE_TIMING_REPORT_ENTRY_LIMIT = 25; // Keeps each logger row readable while retaining the busiest entries.
const storageTimingLogger = getLogger(['wcpos', 'storage', 'timing']);
export function startStorageTimingReporter(): () => void {
	const stopLagSampler = startJsThreadLagSampler();
	const timer = setInterval(() => {
		storageTimingLogger.info('JS thread timing report', {
			context: {
				periodMs: STORAGE_TIMING_REPORT_INTERVAL_MS,
				lag: takeJsThreadLagSnapshot(),
				storage: takeStorageTimingSnapshot().slice(0, STORAGE_TIMING_REPORT_ENTRY_LIMIT),
			},
		});
	}, STORAGE_TIMING_REPORT_INTERVAL_MS);
	return () => {
		clearInterval(timer);
		stopLagSampler();
	};
}
