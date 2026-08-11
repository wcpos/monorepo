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
 * the spec forces it: the reload's FIRST sequence-log response gets its `checkpoint.head`
 * inflated past the backlog threshold. That flips the engine's own rebaseline branch;
 * every audit endpoint (scan, bucket, digests) stays fully live. Subsequent polls pass
 * through untouched — an over-head cursor just idles until the log catches up.
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

// Ceilings from the lane registry: 3 id-spaces × 3 gap-skipping scan pages, K=2 drills.
const MAX_SCAN_REQUESTS = 9;
const MAX_BUCKET_REQUESTS = 2;

// The 60s audit hold starts only after the rebaseline's seed + drain lanes finish, so
// the first audit scan is lifecycle-driven, not clock-driven — allow a slow store time.
const FIRST_AUDIT_SCAN_TIMEOUT_MS = 240_000;
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
 * Force the engine's own rebaseline branch on the next sequence-log poll: rewrite the
 * response's `checkpoint.head` to sit `REPLAY_BACKLOG + 1` past the client's cursor.
 * One-shot — later polls hit the real server untouched. Never throws from the route
 * handler (#997): any surprise falls through to the unmodified live response.
 */
async function forceRebaselineOnNextPoll(page: Page): Promise<{ fired: () => boolean }> {
	let fired = false;
	await page.route('**/changes/sequence-log*', async (route) => {
		if (fired) {
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
			fired = true;
			await route.fulfill({ response, json: body });
		} catch {
			await route.fallback().catch(() => undefined);
		}
	});
	return { fired: () => fired };
}

test.describe('#1129 — store-open politeness against the live server', () => {
	test('a forced populated-manifest rebaseline keeps audit traffic out of the open window and within ceilings', async ({
		page,
	}, testInfo) => {
		test.setTimeout(600_000);

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
			}
		});
		page.on('response', (response) => {
			const entry = byRequest.get(response.request());
			if (entry) entry.status = response.status();
		});
		page.on('requestfailed', (request) => {
			const entry = byRequest.get(request);
			if (entry) entry.failed = true;
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

		// --- Wait for the audit lifecycle, not the clock: the hold starts after the
		// rebaseline's seeds + drain, so a fixed sleep races slow stores (codex review).
		await expect
			.poll(() => requests.some((entry) => isAuditScan(entry.path)), {
				timeout: FIRST_AUDIT_SCAN_TIMEOUT_MS,
				message:
					'no existence-audit scan observed — the forced rebaseline did not exercise the audit chain',
			})
			.toBe(true);
		// Let the pass settle: quiet for AUDIT_QUIET_MS, capped so a floody regression
		// still reaches the ceiling assertions instead of timing out the test.
		const quietDeadline = Date.now() + AUDIT_QUIET_CAP_MS;
		for (;;) {
			const seen = requests.filter((entry) => isAuditShaped(entry.path)).length;
			await page.waitForTimeout(5_000);
			const now = Date.now();
			const latest = requests.filter((entry) => isAuditShaped(entry.path));
			const newestAtMs = latest.length === 0 ? 0 : latest[latest.length - 1]!.atMs;
			if (latest.length === seen && now - newestAtMs >= AUDIT_QUIET_MS) break;
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
