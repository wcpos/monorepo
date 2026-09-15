import * as path from 'path';

import { expect, test } from './test';
import { authenticateWithStore, getStoreUrl, wcposRestRoute } from './fixtures';
import {
	shouldStubCrossOriginStoreRequests,
	stubCrossOriginStoreDiscovery,
	stubCrossOriginStoreUploads,
} from './global-setup';
import { compareBundleIdentity, entryFromHtml, localEntry } from './served-bundle-identity';

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
 * The heap is also gated UNCOLLECTED. The merchant's tab gave most of its 3.2 GB back the moment
 * it was backgrounded, so the failure class is garbage that piles up between collections, which
 * two forced-GC readings can never see. After warm-up the harness collects the retained baseline,
 * then leaves V8 alone throughout disjoint uncollected plateau and tail windows. Every sample
 * must sit under an absolute ceiling; the tail mean must stay close to the warm plateau.
 * SOAK_MINUTES is the measured phase, in addition to the fixed warm-up below.
 *
 * Opt-in, run by hand against a served build (see playwright.soak.config.ts). It authenticates
 * against the configured store itself, like idle-backfill, so a saved snapshot from another
 * store can never be measured under this store's name:
 *
 *   BASE_URL=http://localhost:8081 SOAK_STORE_URL=https://dev-free.wcpos.com SOAK_MINUTES=30 \
 *     npx playwright test --config=playwright.soak.config.ts --workers=1 --project=tick-403-soak
 *
 * Measured 2026-09-15, 60 min against dev-free. On the build BEFORE the export-history fix
 * (e413855dcd) the renderer climbed post-GC 46 → 404 MB in discrete steps, 2.8× from minute 10.
 * On the fixed build the same hour reads 140 MB at minute 10 and 160 MB at minute 60, a 1.14×
 * drift, with nodes ~600 and listeners 761 flat throughout. The ceilings below sit between those
 * two: a build that regresses the export history fails, the healthy drift does not.
 */
const SOAK_MINUTES = Number(process.env.SOAK_MINUTES ?? 12);
const SAMPLE_EVERY_MS = 30_000;
const SAMPLES_PER_MINUTE = 60_000 / SAMPLE_EVERY_MS;
/** A cashier types now and then during the storm; every couple of minutes is enough to keep the lane awake. */
const TYPE_EVERY_MS = 120_000;
const WORD = 'brake';
const KEY_GAP_MS = 400;
/**
 * Index build, catalogue materialisation and the first reference refreshes all land inside the
 * first ten minutes: the fixed build reads 47 MB at minute 0 and 140 MB at minute 10, then drifts
 * 20 MB over the next fifty. A baseline taken before that measures the warm-up, not a leak — which
 * is exactly how an earlier revision of this gate failed a healthy build at 3.07×.
 */
const WARM_UP_MINUTES = 11;
const STEADY_FROM_SAMPLE = WARM_UP_MINUTES * SAMPLES_PER_MINUTE;
/** Samples after the harness collection before the uncollected plateau may begin; the heap re-warms first. */
const REWARM_SAMPLES = 2;
/** The uncollected tail is the last two minutes of samples, averaged so one typing burst cannot decide it. */
const TAIL_WINDOW = 4;
const MIN_SOAK_MINUTES = (REWARM_SAMPLES + 2 * TAIL_WINDOW) / SAMPLES_PER_MINUTE;
if (!Number.isFinite(SOAK_MINUTES) || SOAK_MINUTES < MIN_SOAK_MINUTES) {
	throw new Error(
		`SOAK_MINUTES=${process.env.SOAK_MINUTES} — need at least ${MIN_SOAK_MINUTES} measured minutes after ${WARM_UP_MINUTES} warm-up minutes so re-warm, plateau and tail do not overlap`
	);
}
/** Absolute ceiling on any sample, collected or not — a renderer dies near 4 GB, a healthy tab sits ~200 MB. */
const HEAP_CEILING_BYTES = 768 * 1024 * 1024;
/**
 * Uncollected tail over the warm uncollected plateau. The fixed build drifts 1.14× across a full
 * hour and far less across a 12-minute window; the export-history defect ran 2.8× over the same
 * span. 1.25 sits between them with room for V8's sawtooth.
 */
const MAX_UNCOLLECTED_TAIL_OVER_PLATEAU = 1.25;
/** Post-GC end reading over the post-GC baseline: retained growth, the shape the defect had. */
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
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

test('a permanently 403 tick does not grow the renderer', async ({ page }, testInfo) => {
	test.setTimeout((WARM_UP_MINUTES + SOAK_MINUTES + 12) * 60_000);
	// FIRST: prove the URL under test serves THIS build. A stale bundle from another worktree
	// answers every health check and silently invalidates the oracle (served-bundle-identity.ts).
	const baseURL = testInfo.project.use.baseURL ?? process.env.BASE_URL ?? '';
	const servedHtml = await (await page.request.get(baseURL)).text();
	const identity = compareBundleIdentity(
		localEntry(path.join(__dirname, '..', 'web-build')),
		entryFromHtml(servedHtml),
		baseURL
	);
	if (identity.ok === false)
		throw new Error(`Served bundle identity check failed: ${identity.reason}`);
	console.log(
		identity.ok === true
			? `[tick-403-soak] serving this worktree's build (${identity.entry})`
			: `[tick-403-soak] bundle identity unchecked — ${identity.reason}`
	);

	// The main config's globalSetup does this before its own auth bootstrap; a standalone soak
	// serving the build on localhost against a dev store is exactly the cross-origin case.
	const storeUrl = getStoreUrl(testInfo);
	if (shouldStubCrossOriginStoreRequests(storeUrl, baseURL)) {
		await stubCrossOriginStoreDiscovery(page.context(), storeUrl);
		await stubCrossOriginStoreUploads(page.context());
	}
	// The whole catalogue, not the first row: materialisation that is still running when the
	// baseline is taken would read as growth against it.
	await authenticateWithStore(page, testInfo, {
		waitForCatalogue: true,
		waitForFullCatalogue: true,
	});

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

	const startedAt = Date.now();
	const totalSamples = STEADY_FROM_SAMPLE + Math.floor(SOAK_MINUTES * SAMPLES_PER_MINUTE);
	let lastTypedAt = 0;
	let steady: Sample | null = null;
	/** Every in-run sample V8 was left to manage itself: the readings the uncollected gates see. */
	const uncollected: Sample[] = [];
	for (let sampleNo = 1; sampleNo <= totalSamples; sampleNo += 1) {
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
		// Schedule against elapsed time so typing does not silently eat the required windows.
		await page.waitForTimeout(Math.max(0, startedAt + sampleNo * SAMPLE_EVERY_MS - Date.now()));
		const label = `t+${(sampleNo * SAMPLE_EVERY_MS) / 60_000}min`;
		// Like against like: the baseline the end reading is compared to is itself post-GC. This is
		// the only harness collection before the end; everything after it is V8's own sawtooth.
		if (sampleNo === STEADY_FROM_SAMPLE) steady = await collectedSample(`${label}-collected`);
		else if (sampleNo > STEADY_FROM_SAMPLE + REWARM_SAMPLES) uncollected.push(await sample(label));
		else await sample(label);
	}
	await expect(input).toHaveValue('');
	const afterGc = await collectedSample('after-gc');
	if (!steady)
		throw new Error(`SOAK_MINUTES=${SOAK_MINUTES} is too short to reach the steady-state sample`);
	if (uncollected.length < 2 * TAIL_WINDOW)
		throw new Error(
			`only ${uncollected.length} uncollected samples were taken; ${2 * TAIL_WINDOW} needed for disjoint plateau and tail`
		);
	const plateau = uncollected.slice(0, TAIL_WINDOW);
	const plateauHeap = mean(plateau.map((s) => s.heapUsed));
	const tail = uncollected.slice(-TAIL_WINDOW);
	const tailHeap = mean(tail.map((s) => s.heapUsed));
	const maxHeap = Math.max(...samples.map((s) => s.heapUsed));

	const csv = [
		'label,ticks,heapUsed,nodes,listeners,longTasks,longTaskMs',
		...samples.map((s) =>
			[s.label, s.ticks, s.heapUsed, s.nodes, s.listeners, s.longTasks, s.longTaskMs].join(',')
		),
	].join('\n');
	await testInfo.attach('tick-403-soak.csv', { body: csv, contentType: 'text/csv' });
	const summary =
		`warmUpMinutes=${WARM_UP_MINUTES} minutes=${SOAK_MINUTES} ticks=${ticks} (steady at ${steady.ticks}) steady=${mb(steady.heapUsed)} ` +
		`plateau=${mb(plateauHeap)} tail=${mb(tailHeap)} max=${mb(maxHeap)} ` +
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
	// Uncollected first: these see the garbage a forced collection would hide.
	expect(maxHeap, `heap peaked at ${mb(maxHeap)}`).toBeLessThanOrEqual(HEAP_CEILING_BYTES);
	expect(
		tailHeap / plateauHeap,
		`uncollected tail ${mb(tailHeap)} over the warm uncollected plateau ${mb(plateauHeap)}: garbage is piling up between collections`
	).toBeLessThanOrEqual(MAX_UNCOLLECTED_TAIL_OVER_PLATEAU);
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
