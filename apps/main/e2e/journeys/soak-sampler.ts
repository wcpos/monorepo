/**
 * A journey-agnostic soak sampler: memory and main-thread signals, recorded, never gated.
 *
 * The method is wcpos/roadmap#520's; every threshold belongs to the soak contract (#517). Series:
 * 30 s uncollected `Performance.getMetrics`; per loop LoAF, Event Timing, long tasks and wall time;
 * UA memory every 10 min plus start and end; GC checkpoints (one forced collect, one metrics read).
 * It never forces a GC per sample and never takes a heap snapshot.
 */
import * as fs from 'fs';

import type { Page, TestInfo } from '@playwright/test';

/** The uncollected metrics cadence the research names. */
const SAMPLE_EVERY_MS = 30_000;
/** The UA-memory cadence: the call waits for the browser's own next GC, so it stays rare. */
const UA_MEMORY_EVERY_MS = 10 * 60_000;
/** Settle time after a checkpoint's forced collection, as `tick-403-soak` uses. */
const POST_GC_SETTLE_MS = 1_000;
const EIGHT_HOURS_MS = 8 * 60 * 60_000;

const METRICS = ['heapUsed', 'heapTotal', 'nodes', 'listeners', 'documents'] as const;
/** CDP's name for each metric above. */
const CDP_METRIC = ['JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes', 'JSEventListeners', 'Documents'];
type Metrics = Record<(typeof METRICS)[number], number>;
type Row = { label: string; at: string; elapsedMs: number; error?: string };
type SampleRow = Row & Partial<Metrics>;
type CheckpointRow = SampleRow & { loopsSoFar: number };
const MEMORY = ['windowBytes', 'workerBytes', 'totalBytes'] as const;
type MemoryBytes = Record<(typeof MEMORY)[number], number>;
type MemoryRow = Row & Partial<MemoryBytes>;
type LoopInput = { journey: string; loop: number; wallMs: number; cartAddMs: number | null };
const LOOP_READING =
	'loafCount loafBlockingMs loafTopScripts eventCount eventP50Ms eventP95Ms longTaskCount longTaskMs';
type LoopRow = LoopInput & { observersReinstalled: boolean; error?: string; [k: string]: unknown };
/** What the in-page observers buffer between two `endLoop` drains. */
type SoakBuffer = {
	loaf: { count: number; blockingMs: number; scripts: Record<string, number> };
	events: number[];
	longtask: { count: number; ms: number };
	unavailable: string[];
};

type Stats = { min: number; median: number; p95: number; max: number } | null;
export interface SoakSummary {
	loops: number;
	loopMs: Stats;
	loopsPer8h: number | null;
	bytesPerIteration: number | null;
	nodesPerIteration: number | null;
	listenersPerIteration: number | null;
	counts: Record<string, number>;
	uaMemory: 'ok' | { unavailable: string };
	/** The last UA-memory reading, so `ok` is visibly non-zero. */
	uaMemoryLast: MemoryBytes | null;
	/** Entry types the browser does not support; empty means every observer ran. */
	observersUnavailable: string[];
	cartAddMs: { median: number | null; p95: number | null; max: number | null; nulls: number };
}

export interface SoakSampler {
	/** Arm the in-page observers (LoAF, event, longtask) and the 30 s and 10 min timers. */
	start(): Promise<void>;
	/** Drain the in-page observers into one per-loop row keyed by journey key and loop index. */
	endLoop(row: LoopInput): Promise<void>;
	/** GC checkpoint: forced collect, then one metrics read, labelled. */
	checkpoint(label: string): Promise<void>;
	/** Stop timers; attach soak-samples.csv, soak-loops.csv, soak-memory.csv, soak-checkpoints.csv and soak-summary.json. */
	finish(): Promise<SoakSummary>;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
/** Nearest-rank percentile of an ascending list. */
const rank = (asc: number[], p: number) => asc[Math.max(0, Math.ceil((p / 100) * asc.length) - 1)];
function stats(values: number[]): Stats {
	if (values.length === 0) return null;
	const asc = sorted(values);
	return { min: asc[0], median: rank(asc, 50), p95: rank(asc, 95), max: asc[asc.length - 1] };
}
const ok = <T extends { error?: string }>(rows: T[]) => rows.filter((r) => r.error === undefined);

function csv(columns: readonly string[], rows: object[]): string {
	const cell = (value: unknown) => {
		const text = value === undefined || value === null ? '' : String(value);
		return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
	};
	const line = (row: Record<string, unknown>) => columns.map((c) => cell(row[c])).join(',');
	return [columns.join(','), ...rows.map((row) => line(row as Record<string, unknown>))].join('\n');
}

/**
 * In page: install the observers when this document has none (first call, or after a reload),
 * then optionally drain the buffer. `installed` says the buffer was (re)created by this call.
 */
function soakObservers(drain: boolean) {
	const w = window as unknown as { __WCPOS_SOAK__?: SoakBuffer };
	const empty = () => ({
		loaf: { count: 0, blockingMs: 0, scripts: {} },
		events: [],
		longtask: { count: 0, ms: 0 },
	});
	const installed = !w.__WCPOS_SOAK__;
	if (installed) {
		const buffer: SoakBuffer = { ...empty(), unavailable: [] };
		const supported = PerformanceObserver.supportedEntryTypes;
		const observe = (type: string, init: object, onEntry: (entry: any) => void) => {
			// An unsupported type is silently ignored by `observe`, so ask first and name it.
			if (!supported.includes(type)) return void buffer.unavailable.push(type);
			const observer = new PerformanceObserver((list) => list.getEntries().forEach(onEntry));
			observer.observe({ type, ...init } as PerformanceObserverInit);
		};
		observe('long-animation-frame', {}, (entry) => {
			buffer.loaf.count += 1;
			buffer.loaf.blockingMs += entry.blockingDuration ?? 0;
			for (const script of entry.scripts ?? []) {
				const url = script.sourceURL || '(no url)';
				buffer.loaf.scripts[url] = (buffer.loaf.scripts[url] ?? 0) + script.duration;
			}
		});
		observe('event', { durationThreshold: 16 }, (entry) => buffer.events.push(entry.duration));
		observe('longtask', {}, (entry) => {
			buffer.longtask.count += 1;
			buffer.longtask.ms += entry.duration;
		});
		w.__WCPOS_SOAK__ = buffer;
	}
	const buffer = w.__WCPOS_SOAK__!;
	const reading = JSON.parse(JSON.stringify(buffer)) as SoakBuffer;
	if (drain) Object.assign(buffer, empty());
	return { installed, reading };
}

/** In page: UA memory split by attribution scope. Throws when the API is missing or refuses. */
async function measureUaMemory(): Promise<MemoryBytes> {
	type Result = { bytes: number; breakdown: { bytes: number; attribution: { scope: string }[] }[] };
	const perf = performance as unknown as { measureUserAgentSpecificMemory?: () => Promise<Result> };
	// Name the isolation state either way: the call refuses a page that is not cross-origin isolated.
	const isolation = `(crossOriginIsolated=${self.crossOriginIsolated})`;
	if (typeof perf.measureUserAgentSpecificMemory !== 'function') {
		throw new Error(`performance.measureUserAgentSpecificMemory is missing ${isolation}`);
	}
	const result = await perf.measureUserAgentSpecificMemory().catch((error: unknown) => {
		throw new Error(`${String(error)} ${isolation}`);
	});
	const scoped = (scope: string) =>
		result.breakdown
			.filter((entry) => entry.attribution.some((a) => a.scope === scope))
			.reduce((sum, entry) => sum + entry.bytes, 0);
	const [windowBytes, workerBytes] = ['Window', 'DedicatedWorkerGlobalScope'].map(scoped);
	return { windowBytes, workerBytes, totalBytes: result.bytes };
}

export async function createSoakSampler(page: Page, testInfo: TestInfo): Promise<SoakSampler> {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Performance.enable');
	await cdp.send('HeapProfiler.enable');
	const startedAt = Date.now();
	const row = (label: string): Row => ({
		label,
		at: new Date().toISOString(),
		elapsedMs: Date.now() - startedAt,
	});
	const samples: SampleRow[] = [];
	const loops: LoopRow[] = [];
	const memory: MemoryRow[] = [];
	const checkpoints: CheckpointRow[] = [];
	const timers: ReturnType<typeof setInterval>[] = [];
	const inFlight = new Set<Promise<unknown>>();
	let observersUnavailable: string[] = [];
	let uaUnavailable: string | null = null;
	let uaMemoryLast: MemoryBytes | null = null;
	const track = (work: Promise<unknown>) => {
		inFlight.add(work);
		void work.finally(() => inFlight.delete(work));
	};
	const readMetrics = async (): Promise<Metrics> => {
		const { metrics } = await cdp.send('Performance.getMetrics');
		const entries = METRICS.map((key, i) => {
			const value = metrics.find((m) => m.name === CDP_METRIC[i])?.value;
			// A missing metric is an error row, never a silent zero.
			if (value === undefined) throw new Error(`Performance.getMetrics has no ${CDP_METRIC[i]}`);
			return [key, value];
		});
		return Object.fromEntries(entries) as Metrics;
	};
	// Every timed sample catches into its own row, so one racing teardown never rejects.
	const sampleMetrics = (label: string) =>
		readMetrics()
			.then((metrics) => samples.push({ ...row(label), ...metrics }))
			.catch((error) => samples.push({ ...row(label), error: message(error) }));
	const sampleUaMemory = (label: string) =>
		page
			.evaluate(measureUaMemory)
			.then((bytes) => memory.push({ ...row(label), ...(uaMemoryLast = bytes) }))
			.catch((error) => {
				// The reason's first line; the stack below it is Playwright's evaluate wrapper.
				uaUnavailable ??= message(error).split('\n')[0];
				memory.push({ ...row(label), error: message(error) });
			});

	return {
		async start() {
			observersUnavailable = (await page.evaluate(soakObservers, false)).reading.unavailable;
			track(sampleUaMemory('start'));
			// A run shorter than the 30 s cadence still has a metrics row.
			track(sampleMetrics('start'));
			timers.push(setInterval(() => track(sampleMetrics('30s')), SAMPLE_EVERY_MS));
			timers.push(setInterval(() => track(sampleUaMemory('10min')), UA_MEMORY_EVERY_MS));
		},
		async endLoop(input) {
			try {
				const { installed, reading } = await page.evaluate(soakObservers, true);
				const events = sorted(reading.events);
				const scripts = Object.entries(reading.loaf.scripts)
					.sort(([, a], [, b]) => b - a)
					.slice(0, 3)
					.map(([url, ms]) => `${url} ${Math.round(ms)}ms`);
				loops.push({
					...input,
					loafCount: reading.loaf.count,
					loafBlockingMs: Math.round(reading.loaf.blockingMs),
					loafTopScripts: scripts.join(' | '),
					eventCount: events.length,
					eventP50Ms: events.length ? rank(events, 50) : null,
					eventP95Ms: events.length ? rank(events, 95) : null,
					longTaskCount: reading.longtask.count,
					longTaskMs: Math.round(reading.longtask.ms),
					// A reload dropped the buffer: this loop's in-page reading is lost, and says so.
					observersReinstalled: installed,
				});
			} catch (error) {
				loops.push({ ...input, observersReinstalled: false, error: message(error) });
			}
			console.log(`[soak-loop] ${JSON.stringify(loops[loops.length - 1])}`);
		},
		async checkpoint(label) {
			const base = { ...row(label), loopsSoFar: loops.length };
			try {
				await cdp.send('HeapProfiler.collectGarbage');
				await page.waitForTimeout(POST_GC_SETTLE_MS);
				checkpoints.push({ ...base, ...(await readMetrics()) });
			} catch (error) {
				checkpoints.push({ ...base, error: message(error) });
			}
			console.log(`[soak-checkpoint] ${JSON.stringify(checkpoints[checkpoints.length - 1])}`);
		},
		async finish() {
			timers.forEach(clearInterval);
			await Promise.allSettled([...inFlight]);
			await sampleUaMemory('end');
			// Attribution: retained growth between the first and last good checkpoints, per loop.
			const good = ok(checkpoints);
			const [first, last] = [good[0], good[good.length - 1]];
			const k = good.length >= 2 ? last.loopsSoFar - first.loopsSoFar : 0;
			const perIteration = (key: keyof Metrics) => (k > 0 ? (last[key]! - first[key]!) / k : null);
			const loopMs = stats(loops.map((l) => l.wallMs));
			const cartAdds = loops.map((l) => l.cartAddMs).filter((v): v is number => v !== null);
			const { median, p95, max } = stats(cartAdds) ?? { median: null, p95: null, max: null };
			const goodMemory = ok(memory);
			const total = (key: string) => loops.reduce((sum, l) => sum + Number(l[key] ?? 0), 0);
			const summary: SoakSummary = {
				loops: loops.length,
				loopMs,
				loopsPer8h: loopMs && loopMs.median > 0 ? Math.floor(EIGHT_HOURS_MS / loopMs.median) : null,
				bytesPerIteration: perIteration('heapUsed'),
				nodesPerIteration: perIteration('nodes'),
				listenersPerIteration: perIteration('listeners'),
				counts: {
					samples: ok(samples).length,
					sampleErrors: samples.length - ok(samples).length,
					loopErrors: loops.length - ok(loops).length,
					loafEntries: total('loafCount'),
					eventEntries: total('eventCount'),
					longTasks: total('longTaskCount'),
					uaMemory: goodMemory.length,
					uaMemoryErrors: memory.length - goodMemory.length,
					checkpoints: good.length,
					checkpointErrors: checkpoints.length - good.length,
				},
				uaMemory: uaMemoryLast ? 'ok' : { unavailable: uaUnavailable ?? 'no reading' },
				uaMemoryLast,
				observersUnavailable,
				cartAddMs: { median, p95, max, nulls: loops.length - cartAdds.length },
			};
			const stamp = ['label', 'at', 'elapsedMs'];
			const loopColumns = ['journey', 'loop', 'wallMs', 'cartAddMs', ...LOOP_READING.split(' ')];
			const files: [string, string][] = [
				['soak-samples.csv', csv([...stamp, ...METRICS, 'error'], samples)],
				['soak-loops.csv', csv([...loopColumns, 'observersReinstalled', 'error'], loops)],
				['soak-memory.csv', csv([...stamp, ...MEMORY, 'error'], memory)],
				['soak-checkpoints.csv', csv([...stamp, 'loopsSoFar', ...METRICS, 'error'], checkpoints)],
				['soak-summary.json', JSON.stringify(summary, null, 2)],
			];
			// Written to disk and attached by path: a list-reporter run keeps no body attachment on disk.
			for (const [name, body] of files) {
				const filePath = testInfo.outputPath(name);
				await fs.promises.writeFile(filePath, `${body}\n`);
				const contentType = name.endsWith('.json') ? 'application/json' : 'text/csv';
				await testInfo.attach(name, { path: filePath, contentType });
			}
			console.log(`[soak-summary] ${JSON.stringify(summary)}`);
			return summary;
		},
	};
}
