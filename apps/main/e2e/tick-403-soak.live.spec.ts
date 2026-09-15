import { expect } from '@playwright/test';

import { authenticatedTest as test, wcposRestRoute } from './fixtures';

/**
 * A store that refuses the change-check tick forever must not grow the renderer.
 *
 * broparts.ge, 2026-09-15: the cashier lacked the capability, so `/wcpos/v2/changes/tick`
 * answered 403 (AUTH201) on every tick from 01:02 to 11:49 while the tab stayed open, and the
 * tab was later found at 3 GB. A 403 is a permission error, not an auth failure, so by design
 * the lane keeps polling at full cadence rather than entering the auth hold — which makes it the
 * one background lane a till can run for a whole day without a single success. This soak pins
 * that a day of that produces no growth: heap after a forced GC, DOM nodes and listeners at the
 * end all sit at their steady-state reading, and the tick keeps firing (a lane that silently
 * stops is a different defect, not a pass).
 *
 * Opt-in, run by hand against a served build (see playwright.soak.config.ts):
 *
 *   BASE_URL=http://localhost:8081 E2E_STORE_URL_PRO=https://dev-free.wcpos.com SOAK_MINUTES=30 \
 *     npx playwright test --config=playwright.soak.config.ts --workers=1 --project=idle-soak \
 *     tick-403-soak
 *
 * Measured 2026-09-15 (1.10.16, 12 min, 13 ticks): heap 180–210 MB flat, nodes 594 → 594,
 * listeners 812 → 798, post-GC 183 MB.
 */
const SOAK_MINUTES = Number(process.env.SOAK_MINUTES ?? 12);
const SAMPLE_EVERY_MS = 30_000;
/** A cashier types now and then during the storm; every couple of minutes is enough to keep the lane awake. */
const TYPE_EVERY_MS = 120_000;
const WORD = 'brake';
const KEY_GAP_MS = 400;
/** The steady state is read once the first minute's warm-up has passed. */
const STEADY_FROM_SAMPLE = 2;
const MAX_RETAINED_OVER_STEADY = 1.25;
const MAX_NODES_OVER_STEADY = 1.5;
const MAX_LISTENERS_OVER_STEADY = 1.5;

type Sample = {
	label: string;
	ticks: number;
	heapUsed: number;
	nodes: number;
	listeners: number;
	longTasks: number;
	longTaskMs: number;
};

const mb = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`;

test('a permanently 403 tick does not grow the renderer', async ({ posPage: page }, testInfo) => {
	test.setTimeout((SOAK_MINUTES + 5) * 60_000);
	let ticks = 0;
	await page.route(
		(url) => /^\/wcpos\/v2\/changes\/tick\/?$/.test(wcposRestRoute(url.toString()) ?? ''),
		async (route) => {
			ticks += 1;
			await route.fulfill({
				status: 403,
				contentType: 'application/json',
				body: JSON.stringify({
					code: 'rest_forbidden',
					message: 'Sorry, you are not allowed to do that.',
					data: { status: 403 },
				}),
			});
		}
	);

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
			ticks,
			heapUsed: get('JSHeapUsedSize'),
			nodes: get('Nodes'),
			listeners: get('JSEventListeners'),
			longTasks,
			longTaskMs,
		};
		samples.push(row);
		console.log(
			`[tick-403-soak] ${row.label} ticks=${row.ticks} heap=${mb(row.heapUsed)} nodes=${row.nodes} ` +
				`listeners=${row.listeners} longTasks=${row.longTasks} longTaskMs=${row.longTaskMs.toFixed(0)}`
		);
		return row;
	};

	const input = page.getByTestId('search-products').first();
	await expect(input).toBeVisible({ timeout: 30_000 });
	await sample('start');

	const endAt = Date.now() + SOAK_MINUTES * 60_000;
	let lastTypedAt = 0;
	let sampleNo = 0;
	while (Date.now() < endAt) {
		if (Date.now() - lastTypedAt >= TYPE_EVERY_MS) {
			await input.click();
			for (const ch of WORD) {
				await page.keyboard.type(ch);
				await page.waitForTimeout(KEY_GAP_MS);
			}
			await page.waitForTimeout(800);
			for (let k = 0; k < WORD.length; k += 1) {
				await page.keyboard.press('Backspace');
				await page.waitForTimeout(KEY_GAP_MS);
			}
			lastTypedAt = Date.now();
		}
		await page.waitForTimeout(SAMPLE_EVERY_MS);
		sampleNo += 1;
		await sample(`t+${(sampleNo * SAMPLE_EVERY_MS) / 60_000}min`);
	}
	await expect(input).toHaveValue('');

	await cdp.send('HeapProfiler.collectGarbage');
	await page.waitForTimeout(1_000);
	const afterGc = await sample('after-gc');

	const csv = [
		'label,ticks,heapUsed,nodes,listeners,longTasks,longTaskMs',
		...samples.map((s) =>
			[s.label, s.ticks, s.heapUsed, s.nodes, s.listeners, s.longTasks, s.longTaskMs].join(',')
		),
	].join('\n');
	await testInfo.attach('tick-403-soak.csv', { body: csv, contentType: 'text/csv' });

	const steady = samples[STEADY_FROM_SAMPLE] ?? samples[1];
	console.log(
		`[tick-403-soak] summary minutes=${SOAK_MINUTES} ticks=${ticks} steady=${mb(steady.heapUsed)} ` +
			`afterGc=${mb(afterGc.heapUsed)} nodes ${steady.nodes}→${afterGc.nodes} ` +
			`listeners ${steady.listeners}→${afterGc.listeners} longTaskMs=${afterGc.longTaskMs.toFixed(0)}`
	);

	expect(ticks, 'the lane stopped ticking: the stub saw no tick request').toBeGreaterThan(0);
	expect(
		afterGc.heapUsed / steady.heapUsed,
		`${mb(afterGc.heapUsed)} retained after GC over steady ${mb(steady.heapUsed)} across ${ticks} failed ticks`
	).toBeLessThanOrEqual(MAX_RETAINED_OVER_STEADY);
	expect(
		afterGc.nodes / steady.nodes,
		`DOM nodes ${steady.nodes} → ${afterGc.nodes}`
	).toBeLessThanOrEqual(MAX_NODES_OVER_STEADY);
	expect(
		afterGc.listeners / steady.listeners,
		`listeners ${steady.listeners} → ${afterGc.listeners}`
	).toBeLessThanOrEqual(MAX_LISTENERS_OVER_STEADY);
});
