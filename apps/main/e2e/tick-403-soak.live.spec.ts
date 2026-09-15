import { expect, test } from './test';
import { authenticateWithStore, getStoreUrl, wcposRestRoute } from './fixtures';
import { shouldStubCrossOriginStoreRequests, stubCrossOriginStoreDiscovery } from './global-setup';

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
 * Opt-in, run by hand against a served build (see playwright.soak.config.ts). It authenticates
 * against the configured store itself, like idle-backfill, so a saved snapshot from another
 * store can never be measured under this store's name:
 *
 *   BASE_URL=http://localhost:8081 SOAK_STORE_URL=https://dev-free.wcpos.com SOAK_MINUTES=30 \
 *     npx playwright test --config=playwright.soak.config.ts --workers=1 --project=tick-403-soak
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
/** The steady state is read once the first minute's warm-up has passed — after a forced GC, like the end reading. */
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

test('a permanently 403 tick does not grow the renderer', async ({ page }, testInfo) => {
	test.setTimeout((SOAK_MINUTES + 8) * 60_000);
	// The main config's globalSetup does this before its own auth bootstrap; a standalone soak
	// serving the build on localhost against a dev store is exactly the cross-origin case.
	const storeUrl = getStoreUrl(testInfo);
	const baseURL = testInfo.project.use.baseURL ?? process.env.BASE_URL ?? '';
	if (shouldStubCrossOriginStoreRequests(storeUrl, baseURL)) {
		await stubCrossOriginStoreDiscovery(page.context(), storeUrl);
	}
	await authenticateWithStore(page, testInfo, { waitForCatalogue: true });

	// Installed AFTER the store is connected, so the refusal covers the till's own ticks and never
	// the connect flow. Only requests the app actually sent count as ticks; the browser's CORS
	// preflight is answered separately, and every mocked cross-origin response carries CORS
	// headers — without them the browser reports a network error and the condition under test
	// silently becomes "offline".
	let ticks = 0;
	await page.route(
		(url) => /^\/wcpos\/v2\/changes\/tick\/?$/.test(wcposRestRoute(url.toString()) ?? ''),
		async (route) => {
			const request = route.request();
			if (request.method() === 'OPTIONS') {
				await route.fulfill({
					status: 200,
					headers: {
						'access-control-allow-origin': '*',
						'access-control-allow-methods': 'OPTIONS, GET, POST, PUT, PATCH, DELETE',
						'access-control-allow-headers':
							request.headers()['access-control-request-headers'] ?? '*',
					},
				});
				return;
			}
			ticks += 1;
			await route.fulfill({
				status: 403,
				headers: {
					'access-control-allow-origin': '*',
					'cache-control': 'no-store',
					'content-type': 'application/json; charset=UTF-8',
				},
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
		// The project logger prints only warn/error outside dev builds, so a measurement routed
		// through it never reaches a CI log (search-latency's line never has); stdout carries it.
		console.log(
			`[tick-403-soak] ${row.label} ticks=${row.ticks} heap=${mb(row.heapUsed)} nodes=${row.nodes} ` +
				`listeners=${row.listeners} longTasks=${row.longTasks} longTaskMs=${row.longTaskMs.toFixed(0)}`
		);
		return row;
	};
	const collectedSample = async (label: string): Promise<Sample> => {
		await cdp.send('HeapProfiler.collectGarbage');
		await page.waitForTimeout(1_000);
		return sample(label);
	};

	const input = page.getByTestId('search-products').first();
	await expect(input).toBeVisible({ timeout: 30_000 });
	await sample('start');

	const endAt = Date.now() + SOAK_MINUTES * 60_000;
	let lastTypedAt = 0;
	let sampleNo = 0;
	let steady: Sample | null = null;
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
		const label = `t+${(sampleNo * SAMPLE_EVERY_MS) / 60_000}min`;
		// Like against like: the baseline the end reading is compared to is itself post-GC.
		if (sampleNo === STEADY_FROM_SAMPLE) steady = await collectedSample(`${label}-collected`);
		else await sample(label);
	}
	await expect(input).toHaveValue('');
	const afterGc = await collectedSample('after-gc');
	if (!steady)
		throw new Error(`SOAK_MINUTES=${SOAK_MINUTES} is too short to reach the steady-state sample`);

	const csv = [
		'label,ticks,heapUsed,nodes,listeners,longTasks,longTaskMs',
		...samples.map((s) =>
			[s.label, s.ticks, s.heapUsed, s.nodes, s.listeners, s.longTasks, s.longTaskMs].join(',')
		),
	].join('\n');
	await testInfo.attach('tick-403-soak.csv', { body: csv, contentType: 'text/csv' });
	const summary =
		`minutes=${SOAK_MINUTES} ticks=${ticks} (steady at ${steady.ticks}) steady=${mb(steady.heapUsed)} ` +
		`afterGc=${mb(afterGc.heapUsed)} nodes ${steady.nodes}→${afterGc.nodes} ` +
		`listeners ${steady.listeners}→${afterGc.listeners} longTaskMs=${afterGc.longTaskMs.toFixed(0)}`;
	testInfo.annotations.push({ type: 'tick-403-soak', description: summary });
	console.log(`[tick-403-soak] summary ${summary}`);

	// The lane must keep ticking for the whole soak: a lane that gives up after the first refusal
	// would leave the rest of the run measuring an idle renderer.
	expect(ticks, 'the stub saw fewer than two tick requests').toBeGreaterThanOrEqual(2);
	expect(
		ticks,
		`the lane stopped ticking after the steady-state sample (${steady.ticks} then, ${ticks} at the end)`
	).toBeGreaterThan(steady.ticks);
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
