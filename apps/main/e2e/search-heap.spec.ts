import { expect } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';

/**
 * The products search box must not leak or stall per committed search.
 *
 * Born of the 2026-09-15 broparts.ge report: "typing then deleting in the POS search goes janky
 * while sync runs, then the tab dies" — Chrome Task Manager showed the tab at 3.2 GB. Every path
 * measured that day (two bundles headless, four passes on the merchant's own tab) came back flat:
 * the heap warms to a plateau within the first few cycles and then oscillates. This spec pins that
 * shape so a build whose search path retains per keystroke, or whose search work blocks the main
 * thread, fails here instead of on a merchant's till.
 *
 * Method: type a word one key at a time and delete it the same way, slower than the 250 ms commit
 * debounce so EVERY key commits its own search (the "deleting characters" case widens the match
 * set on every step). After each cycle the renderer's JS heap, DOM node count and long-task total
 * are sampled over CDP. The gates compare the tail of the run to its warm plateau, never to the
 * cold start, so cache warm-up cannot fail it and a trend cannot pass it.
 *
 * The harness forces exactly one collection during the run, at the end of the warm-up and BEFORE
 * the trend window opens: it supplies the collected baseline the end-of-run collected reading is
 * compared to. From there to the last cycle nothing but V8 collects, so garbage that accumulates
 * per committed search is measured as it would on a till, not wiped between the plateau and the
 * tail. The main-thread time that collection costs is subtracted from the long-task budget.
 *
 * Measured 2026-09-15 on dev-free (359-product fixture store, published 1.10.15 and 1.10.16
 * bundles): 400 committed searches, heap 70 → plateau 150–225 MB, 1 long task (124 ms) in
 * total, post-GC 174 MB. The ceilings below are 2–3× those readings.
 *
 * The trend gate compares the MINIMUM heap in each window, not the mean. Since #2092 (search
 * answered from a folded-text blob, hits materialised through `findByIds`) the per-search
 * sawtooth is taller and V8's major-collection period no longer fits inside a 5-cycle window, so
 * two window means differ by GC phase alone: on 2026-09-16 first attempts read 1.33–1.51 while the
 * retained-after-GC gate sat at ~1.15 in every run and the window troughs were flat. A leak per
 * committed search raises the troughs; collection timing only moves peaks and means.
 */
const WORD = 'brake';
const KEY_GAP_MS = 400; // > the 250 ms debounce, so each key is its own committed search
const SETTLE_MS = 800;
/** Cycles before the collected baseline is taken; the first cycles pay index/import/query-cache warm-up. */
const WARM_UP_CYCLES = 5;
/** Cycles after the harness collection before the plateau is read, so it reads a re-warmed heap, not a freshly swept one. */
const REWARM_CYCLES = 2;
const PLATEAU_WINDOW = 5;
/** Fewer cycles than this and the plateau and tail windows overlap, which reads a trend as flat. */
const MIN_CYCLES = WARM_UP_CYCLES + REWARM_CYCLES + 2 * PLATEAU_WINDOW;
const CYCLES = Number(process.env.SEARCH_HEAP_CYCLES ?? 20);
if (!Number.isInteger(CYCLES) || CYCLES < MIN_CYCLES) {
	throw new Error(
		`SEARCH_HEAP_CYCLES=${process.env.SEARCH_HEAP_CYCLES} — need an integer ≥ ${MIN_CYCLES} so the plateau and tail windows are disjoint`
	);
}
/** Absolute ceiling on the heap at any sample — a renderer dies near 4 GB, a healthy tab sits ~200 MB. */
const HEAP_CEILING_BYTES = 768 * 1024 * 1024;
/** Tail floor over plateau floor (window minima): a leak per committed search reads as rising troughs. */
const MAX_TAIL_OVER_PLATEAU = 1.25;
/** Post-GC heap over the collected baseline: what a forced collection cannot reclaim is retained. */
const MAX_RETAINED_OVER_BASELINE = 1.25;
/** DOM nodes at the end over the plateau: detached-but-referenced rows show up here first. */
const MAX_NODES_OVER_PLATEAU = 1.5;
/** Total main-thread long-task time across every committed search (measured: 124 ms in 400). */
const LONG_TASK_BUDGET_MS = 2_000;

type Sample = {
	label: string;
	heapUsed: number;
	heapTotal: number;
	nodes: number;
	listeners: number;
	longTasks: number;
	longTaskMs: number;
};

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const min = (values: number[]) => Math.min(...values);
const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

test('committed searches neither retain per keystroke nor block the main thread', async ({
	posPage: page,
}, testInfo) => {
	test.setTimeout(10 * 60_000);
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Performance.enable');
	await cdp.send('HeapProfiler.enable');
	await page.evaluate(() => {
		const w = window as unknown as { __lt: number; __ltMs: number };
		w.__lt = 0;
		w.__ltMs = 0;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) {
				w.__lt += 1;
				w.__ltMs += entry.duration;
			}
		}).observe({ entryTypes: ['longtask'] });
	});

	const samples: Sample[] = [];
	const sample = async (label: string): Promise<Sample> => {
		const { metrics } = await cdp.send('Performance.getMetrics');
		const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
		const [longTasks, longTaskMs] = await page.evaluate(() => {
			const w = window as unknown as { __lt: number; __ltMs: number };
			return [w.__lt, w.__ltMs];
		});
		const row: Sample = {
			label,
			heapUsed: get('JSHeapUsedSize'),
			heapTotal: get('JSHeapTotalSize'),
			nodes: get('Nodes'),
			listeners: get('JSEventListeners'),
			longTasks,
			longTaskMs,
		};
		samples.push(row);
		return row;
	};

	const input = page.getByTestId('search-products').first();
	await expect(input).toBeVisible({ timeout: 30_000 });
	await sample('start');

	let collectedBaseline: Sample | null = null;
	/** Long-task time the harness's own warm-up collection cost; not search work, so not budgeted. */
	let harnessLongTaskMs = 0;
	for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
		await input.click();
		for (const ch of WORD) {
			await page.keyboard.type(ch);
			await page.waitForTimeout(KEY_GAP_MS);
		}
		await page.waitForTimeout(SETTLE_MS);
		for (let k = 0; k < WORD.length; k += 1) {
			await page.keyboard.press('Backspace');
			await page.waitForTimeout(KEY_GAP_MS);
		}
		await page.waitForTimeout(SETTLE_MS);
		const cycleSample = await sample(`cycle-${cycle}`);
		// Like against like: the retained-heap gate compares the end-of-run collected reading to a
		// collected reading, never to a pre-GC sample. Taken at the end of the warm-up so the trend
		// window that follows is never interrupted by a harness collection.
		if (cycle === WARM_UP_CYCLES) {
			await cdp.send('HeapProfiler.collectGarbage');
			await page.waitForTimeout(1_000);
			collectedBaseline = await sample('warm-up-collected');
			harnessLongTaskMs += collectedBaseline.longTaskMs - cycleSample.longTaskMs;
		}
	}
	await expect(input).toHaveValue('');
	// Long tasks are read BEFORE the harness's final forced collection, which can itself stall the
	// renderer past the long-task threshold on a big heap; only search work is budgeted.
	const lastCycle = samples[samples.length - 1];
	const searchLongTaskMs = lastCycle.longTaskMs - harnessLongTaskMs;

	await cdp.send('HeapProfiler.collectGarbage');
	await page.waitForTimeout(1_000);
	const afterGc = await sample('after-gc');
	if (!collectedBaseline) throw new Error('the collected baseline sample was never taken');

	const cycles = samples.filter((s) => s.label.startsWith('cycle-'));
	const plateauFrom = WARM_UP_CYCLES + REWARM_CYCLES;
	const plateau = cycles.slice(plateauFrom, plateauFrom + PLATEAU_WINDOW);
	const tail = cycles.slice(-PLATEAU_WINDOW);
	// Floors gate the trend (see the header); the means are printed alongside so this run's line
	// compares with every run logged before the gate changed.
	const plateauHeap = min(plateau.map((s) => s.heapUsed));
	const tailHeap = min(tail.map((s) => s.heapUsed));
	const plateauMean = mean(plateau.map((s) => s.heapUsed));
	const tailMean = mean(tail.map((s) => s.heapUsed));
	const plateauNodes = mean(plateau.map((s) => s.nodes));
	const maxHeap = Math.max(...samples.map((s) => s.heapUsed));
	/** Per-cycle heapUsed in MB: the sawtooth a red run needs to show, not two summary numbers. */
	const heapSeries = cycles.map((s) => (s.heapUsed / 1048576).toFixed(1)).join(' ');

	const csv = [
		'label,heapUsed,heapTotal,nodes,listeners,longTasks,longTaskMs',
		...samples.map((s) =>
			[s.label, s.heapUsed, s.heapTotal, s.nodes, s.listeners, s.longTasks, s.longTaskMs].join(',')
		),
	].join('\n');
	await testInfo.attach('search-heap.csv', { body: csv, contentType: 'text/csv' });
	// Printed on every run so a CI log carries the measured numbers, not only pass/fail. The
	// project logger prints only warn/error outside dev builds, so a measurement routed through it
	// never reaches a CI log (search-latency's line never has); stdout and the annotation carry it.
	const summary =
		`cycles=${CYCLES} commits=${CYCLES * WORD.length * 2} plateauFloor=${mb(plateauHeap)} ` +
		`tailFloor=${mb(tailHeap)} plateauMean=${mb(plateauMean)} tailMean=${mb(tailMean)} ` +
		`max=${mb(maxHeap)} baselineCollected=${mb(collectedBaseline.heapUsed)} ` +
		`afterGc=${mb(afterGc.heapUsed)} nodes plateau=${plateauNodes.toFixed(0)} end=${afterGc.nodes} ` +
		`longTasks=${lastCycle.longTasks} longTaskMs=${searchLongTaskMs.toFixed(0)} ` +
		`(harness GC ${harnessLongTaskMs.toFixed(0)})`;
	testInfo.annotations.push({ type: 'search-heap', description: summary });
	console.log(`[search-heap] ${summary}`);
	console.log(`[search-heap] heapUsed/cycle (MB): ${heapSeries}`);

	expect(maxHeap, `heap peaked at ${mb(maxHeap)}`).toBeLessThanOrEqual(HEAP_CEILING_BYTES);
	expect(
		tailHeap / plateauHeap,
		`tail floor ${mb(tailHeap)} over plateau floor ${mb(plateauHeap)}: the heap is trending up per committed search ` +
			`(means ${mb(tailMean)} / ${mb(plateauMean)}; heapUsed/cycle MB: ${heapSeries})`
	).toBeLessThanOrEqual(MAX_TAIL_OVER_PLATEAU);
	expect(
		afterGc.heapUsed / collectedBaseline.heapUsed,
		`${mb(afterGc.heapUsed)} retained after GC over the collected baseline ${mb(collectedBaseline.heapUsed)}`
	).toBeLessThanOrEqual(MAX_RETAINED_OVER_BASELINE);
	expect(
		afterGc.nodes / plateauNodes,
		`${afterGc.nodes} DOM nodes at the end over plateau ${plateauNodes.toFixed(0)}`
	).toBeLessThanOrEqual(MAX_NODES_OVER_PLATEAU);
	expect(
		searchLongTaskMs,
		`${lastCycle.longTasks} long tasks blocked the main thread for ${searchLongTaskMs.toFixed(0)} ms (after subtracting the harness collection)`
	).toBeLessThanOrEqual(LONG_TASK_BUDGET_MS);
});
