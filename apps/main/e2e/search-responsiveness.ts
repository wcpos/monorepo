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

/** Frame cadence is measured, not assumed to be 60 Hz. A missed refresh fails;
 * rAF measures main-thread opportunities; Chromium reports actual compositor drops.
 * Both must pass, and the complete trace is attached for attribution. */
interface FrameReport {
	state: string;
	frame_source: number;
	frame_sequence: number;
	layer_tree_host_id: number;
}
interface TraceEvent {
	name: string;
	args?: { frame_reporter?: FrameReport };
}
export interface SearchMeasurement extends SearchSample {
	frameMs: number;
	missedFrames: number[];
	presentedFrames: number;
	droppedFrames: FrameReport[];
}
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
		if (!previous || !['STATE_DROPPED', 'STATE_PRESENTED_PARTIAL'].includes(previous.state))
			frames.set(key, report);
	}
	return {
		presentedFrames: [...frames.values()].filter((r) => r.state === 'STATE_PRESENTED_ALL').length,
		droppedFrames: [...frames.values()].filter((r) =>
			['STATE_DROPPED', 'STATE_PRESENTED_PARTIAL'].includes(r.state)
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
	}
	return measurement;
}

export function expectSearchResponsive(sample: SearchMeasurement, label: string) {
	expect
		.soft(sample.presentedFrames, `${label}: compositor trace contains presented frames`)
		.toBeGreaterThan(0);
	expect
		.soft(sample.droppedFrames, `${label}: zero dropped or partially presented frames`)
		.toEqual([]);
	expect.soft(sample.frameGaps.length, `${label}: frame sampler ran`).toBeGreaterThan(30);
	expect
		.soft(sample.inputValues.length, `${label}: actual keyboard input reached the field`)
		.toBeGreaterThan(20);
	expect.soft(sample.remounted, `${label}: stable input node`).toBe(false);
	expect.soft(sample.lostFocus, `${label}: uninterrupted focus`).toBe(false);
	expect.soft(sample.longTasks, `${label}: no main-thread long tasks`).toEqual([]);
	expect
		.soft(
			sample.missedFrames,
			`${label}: zero missed frame opportunities (${sample.frameMs.toFixed(2)} ms refresh)`
		)
		.toEqual([]);
}
