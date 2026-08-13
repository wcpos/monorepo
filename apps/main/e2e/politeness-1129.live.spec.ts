import { expect, test } from '@playwright/test';

import { authenticateWithStore, navigateToPage } from './fixtures';

import type { Page, Request } from '@playwright/test';

/**
 * #1129 — the existence audit must never flood the store at open.
 *
 * The one assertion the mocked politeness contracts cannot make: that against a REAL
 * server (real scan membership, real digests, real windowing) a store open issues zero
 * audit traffic before the catalog renders, and a steady-state audit pass costs scan
 * pages — not one integrity/bucket fetch per occupied manifest bucket (the 41-request /
 * 1.2 MB HAR that opened the issue).
 *
 * Not in the CI matrix — `.live.spec.ts`, run by hand after a deploy, because it holds
 * the browser open past the 60s rebaseline audit hold (~4 minutes total) and its whole
 * point is the live server.
 *
 * The measured scenario is a populated-manifest REBASELINE — the profile that produced
 * the flood. A rebaseline only happens when the change-signal cursor is more than
 * `maxReplayBacklog` (5,000) entries behind the head, which a quick reload never is, so
 * the spec forces it in two stages (see forceRebaselineOnNextPoll): one `/changes/tick`
 * response claims a huge head so the engine drains the sequence-log at all, then that
 * drain's `checkpoint.head` is inflated past the backlog threshold. That flips the
 * engine's own rebaseline branch; every audit endpoint (scan, bucket, digests) stays
 * fully live. Subsequent polls pass through untouched — an over-head cursor just idles
 * until the log catches up.
 *
 * Store-agnostic by construction: it asserts REQUEST-SHAPE ceilings from the politeness
 * invariant (wiki ADR 2026-08-11), never catalog contents or counts. A store with no
 * catalog rows cannot populate a manifest, so it skips with the missing prerequisite.
 *
 * Run:
 *   BASE_URL=<client deployment> npx playwright test -c playwright.politeness1129.config.ts
 */

// maxReplayBacklog in packages/sync-core/src/hybridChangeSignal.ts — the forced head
// must clear it for the engine to take the rebaseline branch.
const REPLAY_BACKLOG = 5_000;

// Injected into the ONE mutated `/changes/tick` response so the engine's gatekeeper
// (head > cursor → drain the sequence-log) fires on a quiet store. Only has to beat
// the client's cursor — the rebaseline compare itself happens on the DRAIN envelope's
// head, which stage 2 inflates relative to the real cursor.
const TICK_FORCED_HEAD = 1_000_000_000_000;

// Ceilings from the lane registry: 3 id-spaces × 3 gap-skipping scan pages, K=2 drills.
const MAX_SCAN_REQUESTS = 9;
const MAX_BUCKET_REQUESTS = 2;

// The change-signal lane's idle tick cadence tops out at a 300s tier, so the first
// post-reload drain poll (the request the forced rebaseline rides on) can be ~5 minutes
// out. Wait for that lifecycle event first, with its own budget and failure message.
const DRAIN_POLL_TIMEOUT_MS = 330_000;
// From the drain, the audit chain runs the seed enqueue, the scheduler drain (whose
// tick completion is NOT observable from the network — materialization continues after
// the last visible pull), then the 60s hold, then prime + reconcile. Budget generously;
// the quiescence pass below still bounds a floody regression.
const FIRST_AUDIT_SCAN_TIMEOUT_MS = 300_000;
// The pass has settled when no new audit-shaped request lands for this long.
const AUDIT_QUIET_MS = 25_000;
const AUDIT_QUIET_CAP_MS = 150_000;

type SyncRequest = {
	path: string;
	atMs: number;
	status: number | null;
	failed: boolean;
};

/** Anything audit-shaped, sweep or existence audit alike — the open window allows NONE. */
const isAuditShaped = (path: string) => /\/integrity\/|\/digests(\?|$)/.test(path);
// The existence audit stamps its scans with the servable predicate (`status=publish`
// for products, `collection=` otherwise — reconcile-port.ts); the change-signal TIER-2
// sweep's scans carry neither, so query shape attributes each request to its lane.
// /integrity/bucket is audit-only: sweep drill-downs reuse /integrity/scan?bucket=.
const isAuditScan = (path: string) =>
	path.includes('/integrity/scan') && /[?&](collection|status)=/.test(path);
const isAuditBucket = (path: string) => path.includes('/integrity/bucket');
const isSweepScan = (path: string) => path.includes('/integrity/scan') && !isAuditScan(path);

/**
 * Force the engine's own rebaseline branch — TWO stages since the #1179/#1186
 * change-signal rework, because the engine now polls a lightweight
 * `/changes/tick` gatekeeper and only drains the sequence-log when the tick's
 * `checkpoint.head` exceeds its cursor. On a quiet store no drain ever happens,
 * so a drain-only rewrite waits forever (the 2026-08-13 run failed exactly
 * this way — the drift guard, working as designed).
 *
 * Stage 1 (tick): claim an enormous head on ONE tick response so the engine
 * falls through to a real sequence-log drain. `If-None-Match` is stripped from
 * the forwarded request — the engine ETags its ticks, and a 304 has no body to
 * mutate.
 *
 * Stage 2 (drain): the rebaseline guard compares the DRAIN envelope's
 * `checkpoint.head` against the cursor (hybridChangeSignal.ts:623 — the tick's
 * head value is discarded), so rewrite that head to `since + REPLAY_BACKLOG + 1`
 * exactly as before. Head-priming probes (`limit=1`) stay excluded — mutating
 * one merely moves the initial cursor and wastes the one-shot.
 *
 * Both one-shot; later polls hit the live server untouched — an over-head
 * cursor just idles until the log catches up. Never throws from a route
 * handler (#997). Armed only once the reload's main-frame navigation commits,
 * so the pre-reload instance's polls can't consume the one-shots (coderabbit
 * review).
 */
async function forceRebaselineOnNextPoll(
	page: Page
): Promise<{ tickFired: () => boolean; fired: () => boolean }> {
	let tickFired = false;
	let drainFired = false;
	let armed = false;
	page.once('framenavigated', (frame) => {
		if (frame === page.mainFrame()) armed = true;
	});
	await page.route('**/changes/tick*', async (route) => {
		if (!armed || tickFired) {
			await route.fallback();
			return;
		}
		try {
			const headers = { ...route.request().headers() };
			delete headers['if-none-match'];
			const response = await route.fetch({ headers });
			const body = (await response.json()) as { checkpoint?: Record<string, unknown> };
			body.checkpoint = { ...body.checkpoint, head: TICK_FORCED_HEAD };
			tickFired = true;
			await route.fulfill({ response, json: body });
		} catch {
			await route.fallback().catch(() => undefined);
		}
	});
	await page.route('**/changes/sequence-log*', async (route) => {
		const isHeadPriming = new URL(route.request().url()).searchParams.get('limit') === '1';
		if (!armed || drainFired || isHeadPriming) {
			await route.fallback();
			return;
		}
		try {
			const response = await route.fetch();
			const body = (await response.json()) as {
				checkpoint?: { since?: number; head?: number };
			};
			const since =
				typeof body.checkpoint?.since === 'number'
					? body.checkpoint.since
					: Number(new URL(route.request().url()).searchParams.get('since') ?? 0);
			body.checkpoint = { ...body.checkpoint, head: since + REPLAY_BACKLOG + 1 };
			drainFired = true;
			await route.fulfill({ response, json: body });
		} catch {
			await route.fallback().catch(() => undefined);
		}
	});
	return { tickFired: () => tickFired, fired: () => drainFired };
}

test.describe('#1129 — store-open politeness against the live server', () => {
	test('a forced populated-manifest rebaseline keeps audit traffic out of the open window and within ceilings', async ({
		page,
	}, testInfo) => {
		test.setTimeout(1_200_000);

		// --- First open: authenticate; catalog-row presence is a prerequisite probe,
		// not an assertion — a store that cannot populate a manifest has nothing to
		// measure (store-agnostic ruling: declared-missing environment is a skip).
		await authenticateWithStore(page, testInfo, { waitForCatalogue: false });
		await navigateToPage(page, 'products');
		const firstProducts = page.getByTestId('screen-products').filter({ visible: true });
		const firstCount = firstProducts.getByTestId('data-table-count');
		await expect(firstCount).toBeVisible({ timeout: 120_000 });
		const hasRows = await firstCount
			.filter({ hasText: /[1-9]/ })
			.waitFor({ timeout: 60_000 })
			.then(
				() => true,
				() => false
			);
		test.skip(
			!hasRows,
			'live store has no catalog rows — the populated-manifest scenario needs a seeded store'
		);
		// Give the seed + digest-on-pull population a window to fill the manifests the
		// measured reopen will walk.
		await page.waitForTimeout(30_000);

		// --- Recorder: request starts, responses, and transport failures. A counted
		// audit request only proves politeness if it actually completed (a 401/500
		// storm must fail the proof, not satisfy the ceiling).
		const requests: SyncRequest[] = [];
		const byRequest = new Map<Request, SyncRequest>();
		const startedAt = Date.now();
		// Audit-shaped starts AND completions both count as activity: quiescence must not
		// be declared between a scan completing and that completion scheduling the next
		// drill-down (coderabbit review).
		const auditActivity = { lastEventAtMs: 0 };
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('/wcpos/v2/')) {
				const entry: SyncRequest = {
					path: new URL(url).pathname + new URL(url).search,
					atMs: Date.now(),
					status: null,
					failed: false,
				};
				requests.push(entry);
				byRequest.set(request, entry);
				if (isAuditShaped(entry.path)) auditActivity.lastEventAtMs = entry.atMs;
			}
		});
		page.on('response', (response) => {
			const entry = byRequest.get(response.request());
			if (entry) {
				entry.status = response.status();
				if (isAuditShaped(entry.path)) auditActivity.lastEventAtMs = Date.now();
			}
		});
		page.on('requestfailed', (request) => {
			const entry = byRequest.get(request);
			if (entry) {
				entry.failed = true;
				if (isAuditShaped(entry.path)) auditActivity.lastEventAtMs = Date.now();
			}
		});

		// --- Measured scenario: reload with the head forced past the replay backlog =
		// a populated-manifest rebaseline (the HAR shape) against the live audit stack.
		const rebaseline = await forceRebaselineOnNextPoll(page);
		await page.reload();

		// Render marker: the table-backed count, not the card-header search box — the
		// table sits behind its own Suspense boundary and renders later (codex review).
		const products = page.getByTestId('screen-products').filter({ visible: true });
		await expect(products.getByTestId('data-table-count').filter({ hasText: /[1-9]/ })).toBeVisible(
			{
				timeout: 120_000,
			}
		);
		const renderedAtMs = Date.now();

		// Invariant 1: the cashier's open window carries ZERO audit traffic, existence
		// audit and integrity sweep alike.
		expect(
			requests
				.filter((entry) => isAuditShaped(entry.path) && entry.atMs < renderedAtMs)
				.map(({ path }) => path),
			'audit traffic before first catalog render'
		).toEqual([]);

		// --- Wait for the audit lifecycle, not the clock (codex review), staged on the
		// two real events: first the drain poll the forced rebaseline rides on (idle
		// tick cadence can hold it back ~5 minutes), then the audit chain's first scan
		// (seeds + the 60s hold run between the two).
		await expect
			.poll(() => rebaseline.tickFired(), {
				timeout: DRAIN_POLL_TIMEOUT_MS,
				message:
					'the engine never issued a /changes/tick poll after reload — no drain could be provoked (tick cadence or endpoint drift?)',
			})
			.toBe(true);
		await expect
			.poll(() => rebaseline.fired(), {
				timeout: DRAIN_POLL_TIMEOUT_MS,
				message:
					'the tick claimed a huge head but the engine never drained the sequence-log — the tick→drain fall-through changed',
			})
			.toBe(true);
		await expect
			.poll(() => requests.some((entry) => isAuditScan(entry.path)), {
				timeout: FIRST_AUDIT_SCAN_TIMEOUT_MS,
				message:
					'no existence-audit scan observed after the forced rebaseline — the audit chain did not run',
			})
			.toBe(true);
		// Let the pass settle: quiet for AUDIT_QUIET_MS with no audit request still in
		// flight — a completed scan can schedule the next drill, so both starts and
		// completions reset the quiet clock (coderabbit review). Capped so a floody
		// regression still reaches the ceiling assertions instead of timing out the test.
		const quietDeadline = Date.now() + AUDIT_QUIET_CAP_MS;
		for (;;) {
			await page.waitForTimeout(5_000);
			const now = Date.now();
			const inFlight = requests.some(
				(entry) => isAuditShaped(entry.path) && entry.status === null && !entry.failed
			);
			if (!inFlight && now - auditActivity.lastEventAtMs >= AUDIT_QUIET_MS) break;
			if (now >= quietDeadline) break;
		}

		const scans = requests.filter((entry) => isAuditScan(entry.path));
		const buckets = requests.filter((entry) => isAuditBucket(entry.path));
		const sweeps = requests.filter((entry) => isSweepScan(entry.path));
		const observed =
			`total v2 requests=${requests.length}, audit scan=${scans.length}, ` +
			`bucket=${buckets.length}, sweep scan=${sweeps.length}, ` +
			`forced rebaseline=${rebaseline.fired()}, render window=${renderedAtMs - startedAt}ms`;
		// Console too — the list reporter drops annotations, and the observed counts ARE
		// the verification record this spec exists to produce.
		console.log(`[politeness-1129] ${observed}`);
		test.info().annotations.push({ type: 'observed', description: observed });

		// The trigger must have been exercised: the forced head rewrite fired, and at
		// least one audit scan ran — zero audit traffic can never pass as politeness.
		expect(rebaseline.fired(), 'sequence-log head rewrite intercepted a poll').toBe(true);
		expect(scans.length, 'existence-audit scan pages observed').toBeGreaterThanOrEqual(1);

		// Every counted audit request completed successfully — an erroring endpoint
		// under the ceiling is a broken deploy, not a polite one (codex review).
		const incomplete = [...scans, ...buckets].filter(
			(entry) => entry.failed || entry.status === null || entry.status < 200 || entry.status >= 300
		);
		expect(
			incomplete.map(({ path, status, failed }) => ({ path, status, failed })),
			'audit requests that failed or never completed'
		).toEqual([]);

		// Invariant 2: the audit pass costs scan pages, not a per-bucket walk. The old
		// behavior produced 41 integrity/bucket fetches here; the ceiling is K=2.
		expect(scans.length, 'scan aggregate pages').toBeLessThanOrEqual(MAX_SCAN_REQUESTS);
		expect(buckets.length, 'integrity/bucket drill-downs').toBeLessThanOrEqual(MAX_BUCKET_REQUESTS);
	});
});
