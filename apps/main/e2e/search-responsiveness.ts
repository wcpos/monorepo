import { writeFile } from 'node:fs/promises';

import { expect, type Page, type TestInfo } from '@playwright/test';

export interface SearchSample {
	frameGaps: number[];
	inputValues: string[];
	keyToFrameMs: number[];
	longTasks: number[];
	remounted: boolean;
	lostFocus: boolean;
}
type MeasurementWindow = Window & { searchMeasurement?: { stop(): SearchSample } };

/** Frame cadence is measured, not assumed to be 60 Hz. rAF measures main-thread
 * opportunities; Chromium reports what the compositor actually presented.
 *
 * What this probe ASSERTS is correctness of the field itself: typed text lands
 * intact, the node is never replaced, focus never moves, and no main-thread
 * task freezes the page (>50 ms).
 *
 * What it only REPORTS (annotations + the saved JSON) is smoothness: dropped
 * frames, partially presented frames Chromium flags as affecting smoothness,
 * missed rAF opportunities, and the longest main-thread gap. Measured
 * 2026-09-16 on the production bundle: keystrokes cost 0.2–1.3 ms each; every
 * reported stall was the single React commit that repopulates the results list
 * ~270 ms after the term changes (18–27 ms: render + per-cell record
 * subscriptions + GC + a forced layout in use-on-end-reached). Whether that
 * one stall lands as a partial or an outright dropped frame varies run to run
 * at 120 Hz. It is a results-list budget owned by the interaction-freeze
 * project, measured on the owner's device — not a gate a shared machine can
 * hold at zero. Do not turn the reported numbers back into assertions here;
 * set the budget there. */
interface FrameReport {
	state: string;
	frame_source: number;
	frame_sequence: number;
	layer_tree_host_id: number;
	/** Chromium's own verdict on whether a partial presentation was visible. */
	affects_smoothness?: boolean;
}
interface TraceEvent {
	name: string;
	args?: { frame_reporter?: FrameReport };
}
export interface SearchMeasurement extends SearchSample {
	frameMs: number;
	missedFrames: number[];
	presentedFrames: number;
	/** STATE_DROPPED: the compositor produced nothing for that vsync. Reported. */
	droppedFrames: FrameReport[];
	/** STATE_PRESENTED_PARTIAL with affects_smoothness: main-thread update was late. Reported. */
	partialFrames: FrameReport[];
}
const MISSED_STATES = ['STATE_DROPPED', 'STATE_PRESENTED_PARTIAL'];
// Chromium's compositor, not an FPS average. Idle/no-update frames are not drops.
// https://chromium.googlesource.com/chromium/src/+/HEAD/cc/metrics/compositor_frame_reporter.cc
export function compositorFrames(trace: TraceEvent[]) {
	const frames = new Map<string, FrameReport>();
	for (const event of trace) {
		const report = event.args?.frame_reporter;
		if (event.name !== 'PipelineReporter' || !report) continue;
		const key = `${report.layer_tree_host_id}:${report.frame_source}:${report.frame_sequence}`;
		const previous = frames.get(key);
		// Main/compositor reporters can describe the same frame: preserve any miss.
		if (!previous || !MISSED_STATES.includes(previous.state)) frames.set(key, report);
	}
	const reports = [...frames.values()];
	return {
		presentedFrames: reports.filter((r) => r.state === 'STATE_PRESENTED_ALL').length,
		droppedFrames: reports.filter((r) => r.state === 'STATE_DROPPED'),
		partialFrames: reports.filter(
			(r) => r.state === 'STATE_PRESENTED_PARTIAL' && r.affects_smoothness === true
		),
	};
}

export async function measureSearch(page: Page, testID: string, testInfo: TestInfo, label: string) {
	const input = page.getByTestId(testID).filter({ visible: true });
	await expect(input).toBeVisible();
	await input.focus();
	const frameMs = await page.evaluate(async () => {
		if (document.visibilityState !== 'visible')
			throw new Error('Frame test needs a foreground page');
		const times: number[] = [];
		await new Promise<void>((resolve) => {
			const frame = (time: number) => {
				times.push(time);
				if (times.length === 61) resolve();
				else requestAnimationFrame(frame);
			};
			requestAnimationFrame(frame);
		});
		const gaps = times
			.slice(1)
			.map((time, i) => time - times[i])
			.sort((a, b) => a - b);
		return gaps[Math.floor(gaps.length / 2)];
	});
	expect(frameMs, 'Usable refresh cadence').toBeGreaterThan(0);
	const listLayout = await page
		.getByTestId(/^(data-table-scroller-.+|pos-products-grid-scroller)$/)
		.filter({ visible: true })
		.evaluateAll((lists) =>
			lists.map((list) => ({
				testID: list.getAttribute('data-testid'),
				viewportHeight: list.clientHeight,
				scrollHeight: list.scrollHeight,
				renderedRows: list.querySelectorAll(
					'[data-testid^="data-table-row-"], [data-testid="product-tile"], [data-testid="variable-product-tile"]'
				).length,
				domNodes: list.querySelectorAll('*').length,
			}))
		);
	const layoutPath = testInfo.outputPath(`${label}-list-layout.json`);
	await writeFile(layoutPath, JSON.stringify(listLayout));
	await testInfo.attach(`${label}-list-layout`, {
		path: layoutPath,
		contentType: 'application/json',
	});
	const cdp = await page.context().newCDPSession(page);
	const trace: TraceEvent[] = [];
	// CDP types this payload as generic dictionaries; the trace schema is decoded below.
	cdp.on('Tracing.dataCollected', ({ value }) => trace.push(...(value as unknown as TraceEvent[])));
	await cdp.send('Tracing.start', {
		categories: 'devtools.timeline,blink.user_timing,cc,benchmark',
		transferMode: 'ReportEvents',
	});
	await input.evaluate((element) => {
		const input = element as HTMLInputElement;
		const sample: SearchSample = {
			frameGaps: [],
			inputValues: [],
			keyToFrameMs: [],
			longTasks: [],
			remounted: false,
			lostFocus: false,
		};
		let previous: number | undefined;
		let frameId = 0;
		const keys: number[] = [];
		const frame = (time: number) => {
			if (previous !== undefined) sample.frameGaps.push(time - previous);
			previous = time;
			for (const key of keys.splice(0)) sample.keyToFrameMs.push(performance.now() - key);
			sample.remounted ||= !input.isConnected;
			sample.lostFocus ||= document.activeElement !== input;
			frameId = requestAnimationFrame(frame);
		};
		const onKey = () => keys.push(performance.now());
		const onInput = () => sample.inputValues.push(input.value);
		input.addEventListener('keydown', onKey);
		input.addEventListener('input', onInput);
		const observer = new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) sample.longTasks.push(entry.duration);
		});
		observer.observe({ type: 'longtask' });
		frameId = requestAnimationFrame(frame);
		(window as MeasurementWindow).searchMeasurement = {
			stop: () => {
				cancelAnimationFrame(frameId);
				input.removeEventListener('keydown', onKey);
				input.removeEventListener('input', onInput);
				for (const entry of observer.takeRecords()) sample.longTasks.push(entry.duration);
				observer.disconnect();
				return sample;
			},
		};
	});
	// Sample typing plus four one-second settling windows, including commits that land then.
	// This does NOT certify later network results; end-to-end result completion remains
	// covered separately by search-latency.spec.ts, not by this frame measurement.
	const term = 'searchprobe12345';
	let measurement: SearchMeasurement;
	try {
		await page.keyboard.type(term, { delay: 10 });
		await page.waitForTimeout(1_000);
		expect.soft(await input.inputValue(), `${label}: rapid typing`).toBe(term);
		for (let i = term.length - 1; i >= 0; i--) {
			await page.keyboard.press('Backspace');
			expect.soft(await input.inputValue(), `${label}: backspace ${i}`).toBe(term.slice(0, i));
		}
		await page.waitForTimeout(1_000);
		expect
			.soft(await input.inputValue(), `${label}: stale results must not restore deleted text`)
			.toBe('');
		await page.keyboard.type('replace');
		for (let i = 0; i < 7; i++) await page.keyboard.press('Shift+ArrowLeft');
		await page.keyboard.type('edited');
		await page.waitForTimeout(1_000);
		expect.soft(await input.inputValue(), `${label}: selection replacement`).toBe('edited');
		for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(1_000);
	} finally {
		const sample = await page.evaluate(() =>
			(window as MeasurementWindow).searchMeasurement!.stop()
		);
		const complete = new Promise<void>((resolve) =>
			cdp.once('Tracing.tracingComplete', () => resolve())
		);
		await cdp.send('Tracing.end');
		await complete;
		await cdp.detach();
		const missedFrames = sample.frameGaps.filter((gap) => gap > frameMs * 1.5);
		measurement = { frameMs, missedFrames, ...sample, ...compositorFrames(trace) };
		const metricsPath = testInfo.outputPath(`${label}-responsiveness.json`);
		const tracePath = testInfo.outputPath(`${label}-chromium-trace.json`);
		await writeFile(metricsPath, JSON.stringify(measurement));
		await writeFile(tracePath, JSON.stringify({ traceEvents: trace }));
		await testInfo.attach(`${label}-responsiveness`, {
			path: metricsPath,
			contentType: 'application/json',
		});
		await testInfo.attach(`${label}-chromium-trace`, {
			path: tracePath,
			contentType: 'application/json',
		});
		// Smoothness is reported, not asserted (see the header comment).
		const longestGap = Math.max(0, ...sample.frameGaps);
		testInfo.annotations.push({
			type: `${label}-smoothness`,
			description:
				`${measurement.partialFrames.length} partial frames affecting smoothness, ` +
				`${measurement.droppedFrames.length} dropped, ` +
				`${missedFrames.length} missed rAF opportunities at ${frameMs.toFixed(1)} ms cadence, ` +
				`longest main-thread gap ${longestGap.toFixed(1)} ms`,
		});
	}
	return measurement;
}

export function expectSearchResponsive(sample: SearchMeasurement, label: string) {
	expect
		.soft(sample.presentedFrames, `${label}: compositor trace contains presented frames`)
		.toBeGreaterThan(0);
	expect.soft(sample.frameGaps.length, `${label}: frame sampler ran`).toBeGreaterThan(30);
	expect
		.soft(sample.inputValues.length, `${label}: actual keyboard input reached the field`)
		.toBeGreaterThan(20);
	expect.soft(sample.remounted, `${label}: stable input node`).toBe(false);
	expect.soft(sample.lostFocus, `${label}: uninterrupted focus`).toBe(false);
	expect.soft(sample.longTasks, `${label}: no main-thread long tasks (>50 ms freezes)`).toEqual([]);
}
