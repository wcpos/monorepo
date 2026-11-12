import {
	STORAGE_TIMING_PROBE_ENABLED,
	takeStorageTimingSnapshot,
} from '@wcpos/database/plugins/storage-timing-probe';
import { startJsThreadLagSampler, takeJsThreadLagSnapshot } from '@wcpos/utils/js-thread-lag';
import { getLogger } from '@wcpos/utils/logger';
export { STORAGE_TIMING_PROBE_ENABLED };
export const STORAGE_TIMING_REPORT_INTERVAL_MS = 60_000; // One row a minute is readable in the Logs screen and negligible write load.
export const STORAGE_TIMING_E2E_REPORT_INTERVAL_MS = 10_000; // A 10 s window resolves a single cart add in the native E2E log.
export const STORAGE_TIMING_E2E_LINE_PREFIX = 'WCPOS_E2E_STORAGE ';
const STORAGE_TIMING_REPORT_ENTRY_LIMIT = 25; // Keeps each logger row readable while retaining the busiest entries.
const E2E_MAX_LINE_LENGTH = 2_000; // Same cap as the engine ledger; longer native log lines get truncated by logcat.
const storageTimingLogger = getLogger(['wcpos', 'storage', 'timing']);

type StorageTimingReport = {
	periodMs: number;
	lag: ReturnType<typeof takeJsThreadLagSnapshot>;
	storage: ReturnType<typeof takeStorageTimingSnapshot>;
};

function emitE2eStorageLine(report: StorageTimingReport): void {
	try {
		const lag = {
			...report.lag,
			blockedMs: Math.round(report.lag.blockedMs),
			maxMs: Math.round(report.lag.maxMs),
		};
		const storage = report.storage.map((entry) => ({
			...entry,
			totalMs: Math.round(entry.totalMs),
			maxMs: Math.round(entry.maxMs),
			slow: entry.slow.map((sample) => ({ ...sample, ms: Math.round(sample.ms) })),
		}));
		const build = (entries: unknown[]) =>
			STORAGE_TIMING_E2E_LINE_PREFIX +
			JSON.stringify({ t: Date.now(), periodMs: report.periodMs, lag, storage: entries });
		let line = build(storage);
		if (line.length > E2E_MAX_LINE_LENGTH) {
			const bare = storage.map(({ slow: _slow, ...entry }) => entry);
			while (bare.length > 0 && (line = build(bare)).length > E2E_MAX_LINE_LENGTH) bare.pop();
		}
		const hook = (globalThis as { nativeLoggingHook?: unknown }).nativeLoggingHook;
		if (typeof hook === 'function') hook(line, 1);
		else console.warn(line);
	} catch {
		// E2E diagnostics must never affect the app.
	}
}

export function startStorageTimingReporter(): () => void {
	const e2e = process.env.EXPO_PUBLIC_WCPOS_E2E === '1';
	const periodMs = e2e ? STORAGE_TIMING_E2E_REPORT_INTERVAL_MS : STORAGE_TIMING_REPORT_INTERVAL_MS;
	const stopLagSampler = startJsThreadLagSampler();
	const timer = setInterval(() => {
		const report: StorageTimingReport = {
			periodMs,
			lag: takeJsThreadLagSnapshot(),
			storage: takeStorageTimingSnapshot().slice(0, STORAGE_TIMING_REPORT_ENTRY_LIMIT),
		};
		storageTimingLogger.info('JS thread timing report', { context: report });
		if (e2e) emitE2eStorageLine(report);
	}, periodMs);
	return () => {
		clearInterval(timer);
		stopLagSampler();
	};
}
