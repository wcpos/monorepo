import { expect, test } from '@playwright/test';

import {
	createServerPressureMonitor,
	parseServerPressure,
} from '../../../packages/sync-engine/src/change-signal/server-pressure';
import { LOADED_COUNT_READY, LOADED_COUNT_TEST_ID } from './catalogue-readiness';
import { authenticateWithStore, navigateToPage } from './fixtures';

import type { Page, Request } from '@playwright/test';
import type { ServerPressure } from '../../../packages/sync-engine/src/change-signal/server-pressure';

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
 * the flood. A quick reload never rebaselines on its own, so the spec forces it via the
 * JOURNAL EPOCH (see forceRebaselineViaEpoch): from the reload onward every tick and
 * sequence-log checkpoint reports one synthetic epoch, so the engine sees a single
 * epoch change against its persisted value and takes its own rebaseline path — then a
 * consistent world (no over-head cursor: #1205's cursor-past-head rule made the old
 * head-inflation force cascade). Every audit endpoint (scan, bucket, digests) stays
 * fully live.
 *
 * Store-agnostic by construction: it asserts REQUEST-SHAPE ceilings from the politeness
 * invariant (wiki ADR 2026-08-11), never catalog contents or counts. A store with no
 * catalog rows cannot populate a manifest, so it skips with the missing prerequisite.
 *
 * Run:
 *   BASE_URL=<client deployment> npx playwright test -c playwright.politeness1129.config.ts
 *
 * PRESSURED RUNS SKIP (mono#1159 ruling, 2026-08-12): while the engine's server-pressure
 * monitor is armed, the existence-audit lanes stand down and their starvation tick is
 * ~2x the lane interval away — far outside this spec's window. When the run records
 * active pressure evidence (failure burst, 429, slow median, Retry-After, or pressure
 * header), the audit-shape assertions skip with that reason; the open-window zero-traffic
 * invariant is still asserted first.
 * Verified live 2026-08-13: a load-17 dev-next session correctly produced zero audit
 * traffic while the browse walk ran exactly once (the #1175 heartbeat proof).
 */

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
	durationMs: number | null;
	settledAtMs: number | null;
	retryAfter: string | null;
	pressure?: ServerPressure;
};

/**
 * Replay client-visible outcomes through the engine's own server-pressure state machine.
 * The minimum ladder (x2) is conservative: evidence is accepted only when every cadence
 * tier the engine permits would still be backing off at the end of the observation window.
 * Under armed pressure the audit lanes DEFER by ruling (mono#1159, 2026-08-12) and
 * their starvation tick is ~2x the lane interval out — far past this spec's budget —
 * so zero audit traffic is the CORRECT outcome, not a broken chain.
 */
function pressureEvidence(entries: readonly SyncRequest[], atMs: number): string | null {
	const monitor = createServerPressureMonitor({ maxMultiplier: 2 });
	const signals = new Set<string>();
	const settled = entries
		.filter(
			(entry): entry is SyncRequest & { durationMs: number; settledAtMs: number } =>
				entry.durationMs !== null && entry.settledAtMs !== null
		)
		.sort((left, right) => left.settledAtMs - right.settledAtMs);
	for (const entry of settled) {
		const transition = monitor.observe({
			atMs: entry.settledAtMs,
			status: entry.failed ? 0 : (entry.status ?? 0),
			durationMs: entry.durationMs,
			retryAfter: entry.retryAfter,
			...(entry.pressure === undefined ? {} : { pressure: entry.pressure }),
		});
		if (transition?.direction === 'backoff') signals.add(transition.signal);
	}
	if (!monitor.isBackingOff(atMs)) return null;
	const retryAfterRemainingMs = Math.max(0, monitor.retryAfterUntilMs() - atMs);
	return (
		`signals=${[...signals].join(',')}, multiplier=x${monitor.multiplier()}, ` +
		`retry-after=${retryAfterRemainingMs > 0 ? `${retryAfterRemainingMs}ms remaining` : 'none'}`
	);
}

const recordedRequest = (input: Partial<SyncRequest> & { settledAtMs: number }): SyncRequest => ({
	path: '/wcpos/v2/products',
	atMs: input.settledAtMs - (input.durationMs ?? 10),
	status: 200,
	failed: false,
	durationMs: 10,
	retryAfter: null,
	...input,
});

test.describe('pressure evidence replay', () => {
	test('rejects failures outside the rolling window and pressure that recovered', () => {
		const spacedFailures = [0, 61_000, 122_000].map((settledAtMs) =>
			recordedRequest({ settledAtMs, status: 503 })
		);
		expect(pressureEvidence(spacedFailures, 122_001)).toBeNull();

		const recovered = [
			recordedRequest({ settledAtMs: 0, status: 429 }),
			...Array.from({ length: 10 }, (_, index) => recordedRequest({ settledAtMs: 60_001 + index })),
		];
		expect(pressureEvidence(recovered, 61_000)).toBeNull();
	});

	test('accepts an active Retry-After window from one 503', () => {
		const evidence = pressureEvidence(
			[recordedRequest({ settledAtMs: 1_000, status: 503, retryAfter: '60' })],
			30_000
		);
		expect(evidence).toContain('server-error');
		expect(evidence).toContain('31000ms remaining');
	});

	test('accepts a full fast high-pressure header window', () => {
		const entries = Array.from({ length: 10 }, (_, index) =>
			recordedRequest({ settledAtMs: index, pressure: parseServerPressure('high') })
		);
		expect(pressureEvidence(entries, 10)).toContain('server-pressure');
	});
});

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
 * Force the engine's own rebaseline — via the JOURNAL EPOCH since the #1205
 * unified-journal client. Head inflation (the pre-#1205 force) is no longer
 * safe: #1205 added a *same-epoch cursor past head → rebaseline* rule, so the
 * over-head cursor the old force left behind would trigger a second, unforced
 * rebaseline inside the measurement window (heads-up posted on #1205).
 *
 * The epoch lever has no such residue: every tick and sequence-log checkpoint
 * carries `epoch` (a string the client persists; a served value differing from
 * the persisted one routes through the rebaseline machinery). The rewrite is
 * PERSISTENT camouflage, not a one-shot: from the reload onward, every
 * response reports the same synthetic epoch, so the engine sees exactly one
 * epoch change (persisted real value → forced value) and then a perfectly
 * consistent world — no cursor mismatch, no cascade.
 *
 * `If-None-Match` is stripped from tick requests — the engine ETags its
 * ticks, and a 304 has no body to rewrite. Legacy servers without tick
 * support still get forced through the sequence-log envelope's epoch. Never
 * throws from a route handler (#997). Armed only once the reload's main-frame
 * navigation commits, so the pre-reload instance persists the REAL epoch the
 * forced value must differ from (coderabbit review, adapted).
 *
 * Prerequisite: the live server must serve journal epochs (free#1581+). On an
 * older deployment no `epoch` reaches the client either way, the first-seen
 * forced value is silently adopted, and the drift guard below fails loudly.
 */
const FORCED_EPOCH = 'politeness-1129-forced-epoch';

async function forceRebaselineViaEpoch(
	page: Page,
	requestCount: () => number
): Promise<{ fired: () => boolean; requestCountAtMutation: () => number }> {
	let mutatedResponseServed = false;
	let firstMutationRequestCount = 0;
	let armed = false;
	page.once('framenavigated', (frame) => {
		if (frame === page.mainFrame()) armed = true;
	});
	const rewriteEpoch = async (route: Parameters<Parameters<Page['route']>[1]>[0]) => {
		if (!armed) {
			await route.fallback();
			return;
		}
		try {
			const headers = { ...route.request().headers() };
			delete headers['if-none-match'];
			const response = await route.fetch({ headers });
			if (!response.ok()) {
				await route.fulfill({ response });
				return;
			}
			const body = (await response.json()) as { checkpoint?: Record<string, unknown> };
			body.checkpoint = { ...body.checkpoint, epoch: FORCED_EPOCH };
			await route.fulfill({ response, json: body });
			if (!mutatedResponseServed) firstMutationRequestCount = requestCount();
			mutatedResponseServed = true;
		} catch {
			await route.fallback().catch(() => undefined);
		}
	};
	await page.route('**/changes/tick*', rewriteEpoch);
	await page.route('**/changes/sequence-log*', rewriteEpoch);
	return {
		fired: () => mutatedResponseServed,
		requestCountAtMutation: () => firstMutationRequestCount,
	};
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
		await expect(firstProducts.getByTestId('data-table-count')).toBeVisible({ timeout: 120_000 });
		// Rows must actually LAND locally — the old /[1-9]/ probe on the footer
		// sentence also matched the server total, so an empty grid with a non-zero
		// total sailed past this gate (#1336, #1345).
		const hasRows = await expect(firstProducts.getByTestId(LOADED_COUNT_TEST_ID))
			.toHaveText(LOADED_COUNT_READY, { timeout: 60_000 })
			.then(
				() => true,
				() => false
			);
		if (!hasRows) {
			// Distinguish declared-missing from broken (store-agnostic ruling): the
			// SERVER total is deliberately the referent here — an empty store shows
			// "0 of 0" and skips, while a non-zero total with zero rendered rows is
			// a sync/render regression and must fail, not skip.
			const serverTotalText =
				(await firstProducts
					.getByTestId('data-table-total-count')
					.textContent()
					.catch(() => null)) ?? '';
			const serverTotal = Number(serverTotalText || '0');
			expect(
				serverTotal,
				`catalog rows never rendered although the footer reports a server total of ${serverTotal} — a product-demand regression looks exactly like this`
			).toBe(0);
		}
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
					durationMs: null,
					settledAtMs: null,
					retryAfter: null,
				};
				requests.push(entry);
				byRequest.set(request, entry);
				if (isAuditShaped(entry.path)) auditActivity.lastEventAtMs = entry.atMs;
			}
		});
		page.on('response', (response) => {
			const entry = byRequest.get(response.request());
			if (entry) {
				const settledAtMs = Date.now();
				const headers = response.headers();
				entry.status = response.status();
				entry.durationMs = settledAtMs - entry.atMs;
				entry.settledAtMs = settledAtMs;
				entry.retryAfter = headers['retry-after'] ?? null;
				entry.pressure = parseServerPressure(headers['x-wcpos-pressure']);
				if (isAuditShaped(entry.path)) auditActivity.lastEventAtMs = settledAtMs;
			}
		});
		page.on('requestfailed', (request) => {
			const entry = byRequest.get(request);
			if (entry) {
				const settledAtMs = Date.now();
				entry.failed = true;
				entry.durationMs = settledAtMs - entry.atMs;
				entry.settledAtMs = settledAtMs;
				if (isAuditShaped(entry.path)) auditActivity.lastEventAtMs = settledAtMs;
			}
		});

		// --- Measured scenario: reload with the head forced past the replay backlog =
		// a populated-manifest rebaseline (the HAR shape) against the live audit stack.
		const rebaseline = await forceRebaselineViaEpoch(page, () => requests.length);
		await page.reload();

		// Render marker: the table-backed count, not the card-header search box — the
		// table sits behind its own Suspense boundary and renders later (codex review).
		// And the LOCAL loaded count, not the footer sentence: the sentence's server
		// total matches /[1-9]/ with zero rows rendered, which would anchor every
		// window invariant below to the wrong moment (#1345).
		const products = page.getByTestId('screen-products').filter({ visible: true });
		await expect(products.getByTestId(LOADED_COUNT_TEST_ID)).toHaveText(LOADED_COUNT_READY, {
			timeout: 120_000,
		});
		await expect(products.getByTestId(/^data-table-row-/).first()).toBeVisible({
			timeout: 120_000,
		});
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
		// Stage 1: a change-signal poll (tick, or sequence-log on a legacy
		// server) was served with the forced epoch. Idle tick cadence can hold
		// the first poll back several minutes.
		await expect
			.poll(() => rebaseline.fired(), {
				timeout: DRAIN_POLL_TIMEOUT_MS,
				message:
					'no change-signal poll was served with the forced epoch after reload — tick cadence or endpoint drift?',
			})
			.toBe(true);
		// Stage 2: the engine actually took the epoch-change rebaseline — the
		// network-visible signature is the browse-window seed page. A server
		// that does not serve journal epochs yet (pre-free#1581 deployment)
		// fails HERE: the first-seen epoch is silently adopted, no rebaseline.
		await expect
			.poll(
				() =>
					requests.slice(rebaseline.requestCountAtMutation()).some(
						// The proof is "a products browse-window seed went out" — identify it
						// by collection + first page, NOT by the default orderby, so the
						// assertion survives default-sort changes (title asc since Paul's
						// 2026-08-19 ruling, #1372; menu_order before that).
						(entry) =>
							entry.path.includes('/products') &&
							entry.path.includes('orderby=') &&
							// per_page=100 is the seed's page size — without it the
							// product-trickle's page-1 request would satisfy this too.
							entry.path.includes('per_page=100') &&
							entry.path.includes('page=1')
					),
				{
					timeout: DRAIN_POLL_TIMEOUT_MS,
					message:
						'the forced epoch was served but no browse-window seed followed — the engine did not take the epoch-change rebaseline (is the live server serving journal epochs, free#1581+?)',
				}
			)
			.toBe(true);
		// The audit chain's first scan — OR a legitimate pressure deferral. Since the
		// mono#1159 ruling (2026-08-12), audit lanes stand down while the server-pressure
		// monitor is armed and their starvation tick sits ~2x the lane interval out, so on
		// a struggling server this window correctly closes with zero audit traffic. That
		// is a skip (environment condition), never a pass — and without pressure evidence
		// a silent chain is still a failure.
		const auditDeadline = Date.now() + FIRST_AUDIT_SCAN_TIMEOUT_MS;
		while (!requests.some((entry) => isAuditScan(entry.path)) && Date.now() < auditDeadline) {
			await page.waitForTimeout(5_000);
		}
		if (!requests.some((entry) => isAuditScan(entry.path))) {
			const evidence = pressureEvidence(requests, Date.now());
			expect(
				evidence,
				'no existence-audit scan observed after the forced rebaseline, and no server-pressure ' +
					'evidence excuses the silence — the audit chain did not run'
			).not.toBeNull();
			test.skip(
				true,
				`audit deferred under armed server pressure (${evidence}) — the starvation ceiling ` +
					'schedules the reduced tick ~30min out (mono#1159 ruling); rerun on a healthy window ' +
					'for the audit-shape proof'
			);
		}
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

		// The trigger must have been exercised: the forced epoch was served, and at
		// least one audit scan ran — zero audit traffic can never pass as politeness.
		expect(rebaseline.fired(), 'forced-epoch rewrite intercepted a change-signal poll').toBe(true);
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
