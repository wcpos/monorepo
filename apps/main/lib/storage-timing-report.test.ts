import { startStorageTimingReporter } from './storage-timing-report';

// New-file collection under the jest-expo winter runtime requires this at module scope.
jest.resetModules();

const mockStopLag = jest.fn();
const mockInfo = jest.fn();
const mockTakeStorage = jest.fn();
const mockTakeLag = jest.fn();

jest.mock('@wcpos/database/plugins/storage-timing-probe', () => ({
	STORAGE_TIMING_PROBE_ENABLED: true,
	takeStorageTimingSnapshot: (...args: unknown[]) => mockTakeStorage(...args),
}));
jest.mock('@wcpos/utils/js-thread-lag', () => ({
	startJsThreadLagSampler: jest.fn(() => mockStopLag),
	takeJsThreadLagSnapshot: (...args: unknown[]) => mockTakeLag(...args),
}));
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => ({ info: (...args: unknown[]) => mockInfo(...args) }),
}));

type NativeLoggingGlobal = typeof globalThis & {
	nativeLoggingHook?: (line: string, level: number) => void;
	HermesInternal?: { getInstrumentedStats?: () => Record<string, number> };
};
const nativeGlobal = globalThis as NativeLoggingGlobal;
const originalFlag = process.env.EXPO_PUBLIC_WCPOS_E2E;
const originalHook = nativeGlobal.nativeLoggingHook;
const originalHermes = nativeGlobal.HermesInternal;
const PREFIX = 'WCPOS_E2E_STORAGE ';
const HERMES_PREFIX = 'WCPOS_E2E_HERMES ';

const entry = (name: string, extra: Record<string, unknown> = {}) => ({
	layer: 'raw',
	collectionName: name,
	method: 'bulkInsert',
	calls: 1,
	totalMs: 5,
	maxMs: 2,
	rows: 3,
	slow: [],
	...extra,
});
const lagSnapshot = (extra: Record<string, unknown> = {}) => ({
	samples: 10,
	blockedMs: 20,
	maxMs: 9,
	buckets: { 16: 1, 50: 0, 100: 0, 250: 0, 500: 0, 1000: 0 },
	...extra,
});

describe('startStorageTimingReporter', () => {
	let hook: jest.Mock;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		hook = jest.fn();
		nativeGlobal.nativeLoggingHook = hook;
		mockTakeLag.mockReturnValue(lagSnapshot());
		mockTakeStorage.mockReturnValue([entry('orders')]);
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
		if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_WCPOS_E2E;
		else process.env.EXPO_PUBLIC_WCPOS_E2E = originalFlag;
		if (originalHook === undefined) delete nativeGlobal.nativeLoggingHook;
		else nativeGlobal.nativeLoggingHook = originalHook;
		if (originalHermes === undefined) delete nativeGlobal.HermesInternal;
		else nativeGlobal.HermesInternal = originalHermes;
	});

	it('reports every 60 s and writes no native line when the E2E flag is unset', () => {
		delete process.env.EXPO_PUBLIC_WCPOS_E2E;
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(10_000);
		expect(mockInfo).not.toHaveBeenCalled();
		expect(hook).not.toHaveBeenCalled();

		jest.advanceTimersByTime(50_000);
		expect(mockInfo).toHaveBeenCalledTimes(1);
		expect(hook).not.toHaveBeenCalled();
		stop();
	});

	it('reports every 10 s and writes one WCPOS_E2E_STORAGE line under E2E', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(10_000);

		expect(mockInfo).toHaveBeenCalledTimes(1);
		expect(hook).toHaveBeenCalledTimes(1);
		const [line, level] = hook.mock.calls[0];
		expect(line.startsWith(PREFIX)).toBe(true);
		expect(level).toBe(1);
		const payload = JSON.parse(line.slice(PREFIX.length));
		expect(payload.periodMs).toBe(10_000);
		expect(payload.lag).toEqual(lagSnapshot());
		expect(payload.storage).toEqual([entry('orders')]);
		expect(typeof payload.t).toBe('number');
		stop();
	});

	it('takes each snapshot once per tick', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(10_000);

		expect(mockTakeLag).toHaveBeenCalledTimes(1);
		expect(mockTakeStorage).toHaveBeenCalledTimes(1);
		stop();
	});

	it('rounds durations to whole milliseconds', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		mockTakeStorage.mockReturnValue([entry('orders', { totalMs: 12.6, maxMs: 3.4 })]);
		mockTakeLag.mockReturnValue(lagSnapshot({ blockedMs: 7.5 }));
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(10_000);

		const payload = JSON.parse(hook.mock.calls[0][0].slice(PREFIX.length));
		expect(payload.storage[0].totalMs).toBe(13);
		expect(payload.storage[0].maxMs).toBe(3);
		expect(payload.lag.blockedMs).toBe(8);
		stop();
	});

	it('keeps the line within 2000 characters by dropping slow samples, then the least busy entries', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		const entries = Array.from({ length: 25 }, (_, i) =>
			entry(`collection-with-a-rather-long-name-${i}-${'x'.repeat(30)}`, {
				slow: [
					{ ms: 40.4, rows: 1 },
					{ ms: 30, rows: 2 },
				],
			})
		);
		mockTakeStorage.mockReturnValue(entries);
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(10_000);

		const line: string = hook.mock.calls[0][0];
		expect(line.length).toBeLessThanOrEqual(2_000);
		expect(line).not.toContain('"slow"');
		const payload = JSON.parse(line.slice(PREFIX.length));
		expect(payload.storage.length).toBeGreaterThan(0);
		expect(payload.storage.length).toBeLessThan(25);
		expect(payload.storage[0].collectionName).toBe(entries[0].collectionName);
		stop();
	});

	it('falls back to console.warn without a native hook', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		delete nativeGlobal.nativeLoggingHook;
		const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(10_000);

		expect(warn).toHaveBeenCalledTimes(1);
		expect(String(warn.mock.calls[0][0]).startsWith(PREFIX)).toBe(true);
		stop();
	});

	it('never throws when the hook throws', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		hook.mockImplementation(() => {
			throw new Error('hook down');
		});
		const stop = startStorageTimingReporter();

		expect(() => jest.advanceTimersByTime(10_000)).not.toThrow();
		expect(mockInfo).toHaveBeenCalledTimes(1);
		stop();
	});

	it('emits a WCPOS_E2E_HERMES line with heap and GC stats under E2E', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		nativeGlobal.HermesInternal = {
			getInstrumentedStats: () => ({
				js_heapSize: 1_048_576,
				js_allocatedBytes: 524_288.4,
				js_totalAllocatedBytes: 9_999_999,
				js_numGCs: 12,
				js_gcTime: 0.2346,
				js_gcCPUTime: 1.5,
				js_mallocSizeEstimate: 77,
			}),
		};
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(10_000);

		const lines: string[] = hook.mock.calls.map(([line]) => line);
		expect(lines.filter((line) => line.startsWith(PREFIX))).toHaveLength(1);
		const hermesLines = lines.filter((line) => line.startsWith(HERMES_PREFIX));
		expect(hermesLines).toHaveLength(1);
		expect(hermesLines[0].length).toBeLessThan(1_000);
		const { t, ...stats } = JSON.parse(hermesLines[0].slice(HERMES_PREFIX.length));
		expect(typeof t).toBe('number');
		expect(stats).toEqual({
			heapSize: 1_048_576,
			allocatedBytes: 524_288,
			totalAllocatedBytes: 9_999_999,
			numGCs: 12,
			gcTimeMs: 235,
			gcCPUTimeMs: 1_500,
		});
		stop();
	});

	it('omits Hermes stats the runtime does not report', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		nativeGlobal.HermesInternal = { getInstrumentedStats: () => ({ js_numGCs: 3 }) };
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(10_000);

		const line = hook.mock.calls.map(([l]) => l).find((l) => l.startsWith(HERMES_PREFIX));
		const { t: _t, ...stats } = JSON.parse(line.slice(HERMES_PREFIX.length));
		expect(stats).toEqual({ numGCs: 3 });
		stop();
	});

	it('emits no Hermes line when HermesInternal is absent', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		delete nativeGlobal.HermesInternal;
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(10_000);

		expect(hook).toHaveBeenCalledTimes(1);
		expect(hook.mock.calls[0][0].startsWith(PREFIX)).toBe(true);
		nativeGlobal.HermesInternal = {};
		jest.advanceTimersByTime(10_000);
		expect(hook).toHaveBeenCalledTimes(2);
		expect(hook.mock.calls.some(([line]) => line.startsWith(HERMES_PREFIX))).toBe(false);
		stop();
	});

	it('emits no Hermes line outside E2E', () => {
		delete process.env.EXPO_PUBLIC_WCPOS_E2E;
		const getInstrumentedStats = jest.fn(() => ({ js_numGCs: 1 }));
		nativeGlobal.HermesInternal = { getInstrumentedStats };
		const stop = startStorageTimingReporter();

		jest.advanceTimersByTime(60_000);

		expect(mockInfo).toHaveBeenCalledTimes(1);
		expect(hook).not.toHaveBeenCalled();
		expect(getInstrumentedStats).not.toHaveBeenCalled();
		stop();
	});

	it('never throws when getInstrumentedStats throws', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		nativeGlobal.HermesInternal = {
			getInstrumentedStats: () => {
				throw new Error('stats down');
			},
		};
		const stop = startStorageTimingReporter();

		expect(() => jest.advanceTimersByTime(10_000)).not.toThrow();
		expect(hook).toHaveBeenCalledTimes(1);
		stop();
	});

	it('stops the timer and the lag sampler', () => {
		process.env.EXPO_PUBLIC_WCPOS_E2E = '1';
		const stop = startStorageTimingReporter();

		stop();
		jest.advanceTimersByTime(60_000);

		expect(mockInfo).not.toHaveBeenCalled();
		expect(hook).not.toHaveBeenCalled();
		expect(mockStopLag).toHaveBeenCalledTimes(1);
	});
});
