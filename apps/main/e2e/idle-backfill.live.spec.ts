import * as path from 'path';

import { expect, test } from './test';
import { authenticateWithStore, navigateToPage } from './fixtures';
import { unwrapWireBody } from './wire-envelope';
import { resolveIdleSoakMs } from './idle-backfill-soak-duration';
import { compareBundleIdentity, entryFromHtml, localEntry } from './served-bundle-identity';

/**
 * Idle-backfill live soak (2026-08-19) — one-shot proof that the merged trickle
 * lanes actually run in a real session. Run by hand, never in CI:
 *
 *   npx serve -s web-build -l 8091   (after build:web)
 *   BASE_URL=http://localhost:8091 npx playwright test \
 *     --config=playwright.soak.config.ts --workers=1 --project=idle-soak
 *
 * Store-agnostic: asserts WIRE traffic shapes, never catalog contents.
 *
 * Oracles:
 *  1. #1279 — clicking "Check everything now" fires census probes (per_page=1)
 *     even while every total is inside its freshness window.
 *  2. product-trickle (#1286) — with the app idle >60s, an ordered
 *     status=publish&orderby=id&order=asc page pull appears within one 5-min
 *     lane cadence, unprompted.
 *  3. variation-prefetch (#1281) — an include= targeted variations pull
 *     appears in the same idle window, asserted only when the session is
 *     ELIGIBLE (see below).
 *
 * ELIGIBILITY, not assumption (review thread on #1309). "Zero variation pulls"
 * is uninterpretable on its own: a catalog with no variable parent and a
 * catalog whose variations are already resident both produce zero, and so does
 * a broken lane. This soak therefore DERIVES eligibility from traffic it
 * already observes, rather than guessing or mocking:
 *
 *   - Every product payload the app pulls is parsed for `type: 'variable'` and
 *     its `variations` id list — those are the parents the lane can walk. The
 *     browser context is fresh, so OPFS starts empty and a resident parent's
 *     variations are absent unless this session fetched them.
 *   - Every `?include=` variations pull in the session records the ids that
 *     ARE now resident.
 *   - Eligible = a resident variable parent with at least one variation id that
 *     no pull in this session covered. If any exists, the idle window MUST show
 *     a variations pull and a zero fails the run. If none exists, the store
 *     genuinely has nothing to prefetch and the oracle reports skip-with-reason
 *     naming which of the two causes applied — the store-agnostic E2E policy's
 *     "declared-missing environment is a skip" rule.
 *
 * No fixture and no same-session mock: eligibility is read off the real
 * browser/store boundary, which is the only thing that proves the lane.
 */

const IDLE_SOAK_MS = resolveIdleSoakMs(process.env.SOAK_MS);
test.setTimeout(IDLE_SOAK_MS + 8 * 60_000);

type WireLog = {
	censusProbes: string[];
	productTricklePages: string[];
	customerTricklePages: string[];
	variationIncludePulls: string[];
	allStoreRequests: string[];
	/** Resident variable parents seen on the wire → their declared variation ids. */
	variableParents: Map<number, number[]>;
	/** Variation ids any `?include=` pull covered this session. */
	fetchedVariationIds: Set<number>;
};

/** Records nested under `payload`, an envelope's `documents`, or a bare array. */
function recordsOf(body: unknown): Record<string, unknown>[] {
	// The raw wire body is B9-enveloped ({ data, _wcpos }) — unwrap before
	// looking for the pull shapes, or every parent-walk observation reads [].
	const payload = unwrapWireBody(body);
	const list = Array.isArray(payload)
		? payload
		: Array.isArray((payload as { documents?: unknown } | null)?.documents)
			? (payload as { documents: unknown[] }).documents
			: [];
	return list.filter((entry): entry is Record<string, unknown> => typeof entry === 'object');
}

function positiveIds(value: unknown): number[] {
	return Array.isArray(value)
		? value.filter((id): id is number => Number.isSafeInteger(id) && (id as number) > 0)
		: [];
}

function watchWire(page: import('@playwright/test').Page): WireLog {
	const log: WireLog = {
		censusProbes: [],
		productTricklePages: [],
		customerTricklePages: [],
		variationIncludePulls: [],
		allStoreRequests: [],
		variableParents: new Map<number, number[]>(),
		fetchedVariationIds: new Set<number>(),
	};
	// Parse product payloads for the parents the prefetch lane can walk. Failures
	// are ignored on purpose: an unreadable body must never fail the soak, it
	// only leaves the session less eligible (and the oracle then skips loudly).
	page.on('response', (response) => {
		const url = response.url();
		if (!url.includes('/products')) return;
		if (url.includes('/variations')) return;
		void response
			.json()
			.then((body) => {
				for (const record of recordsOf(body)) {
					const payload = (record.payload ?? record) as Record<string, unknown>;
					if (payload.type !== 'variable') continue;
					const parentId = Number(payload.id ?? record.id);
					const variationIds = positiveIds(payload.variations);
					if (!Number.isSafeInteger(parentId) || parentId <= 0) continue;
					if (variationIds.length > 0) log.variableParents.set(parentId, variationIds);
				}
			})
			.catch(() => undefined);
	});
	page.on('request', (request) => {
		let url: URL;
		try {
			url = new URL(request.url());
		} catch {
			return;
		}
		const appOrigin = new URL(process.env.BASE_URL ?? 'http://localhost:8091').origin;
		if (url.origin === appOrigin) return;
		log.allStoreRequests.push(`${Date.now()} ${request.method()} ${url.toString()}`);
		const path = url.pathname + (url.searchParams.get('rest_route') ?? '');
		const params = url.searchParams;
		// Census probes ride the collection vocabulary's censusRoute — wc/v3 for
		// most collections, wcpos/v1 for variations — so match the probe SHAPE
		// (page=1&per_page=1 against the store origin), not a route prefix.
		if (params.get('per_page') === '1' && params.get('page') === '1') {
			log.censusProbes.push(url.toString());
		}
		if (!path.includes('/wcpos/')) return;
		if (
			path.includes('/products') &&
			!path.includes('/variations') &&
			params.get('status') === 'publish' &&
			params.get('orderby') === 'id' &&
			params.get('order') === 'asc'
		) {
			log.productTricklePages.push(url.toString());
		}
		if (path.includes('/variations') && params.has('include')) {
			log.variationIncludePulls.push(url.toString());
			for (const id of (params.get('include') ?? '').split(',')) {
				const parsed = Number(id.trim());
				if (Number.isSafeInteger(parsed) && parsed > 0) log.fetchedVariationIds.add(parsed);
			}
		}
		if (
			path.includes('/customers') &&
			params.get('orderby') === 'id' &&
			params.get('order') === 'asc' &&
			params.has('page')
		) {
			log.customerTricklePages.push(url.toString());
		}
	});
	return log;
}

test('idle POS trickles products+variations and manual check refreshes totals', async ({
	page,
}, testInfo) => {
	// FIRST, before anything else: prove the URL under test serves THIS build.
	// A stale bundle from another worktree answers health checks perfectly and
	// silently invalidates every oracle below (see served-bundle-identity.ts).
	const baseUrl = testInfo.project.use.baseURL ?? process.env.BASE_URL ?? '';
	const servedHtml = await (await page.request.get(baseUrl)).text();
	const identity = compareBundleIdentity(
		localEntry(path.join(__dirname, '..', 'web-build')),
		entryFromHtml(servedHtml),
		baseUrl
	);
	if (identity.ok === false)
		throw new Error(`Served bundle identity check failed: ${identity.reason}`);
	console.log(
		identity.ok === true
			? `[soak] serving this worktree's build (${identity.entry})`
			: `[soak] bundle identity unchecked — ${identity.reason}`
	);

	const wire = watchWire(page);

	await authenticateWithStore(page, testInfo, { waitForCatalogue: true });

	await navigateToPage(page, 'health');
	await page.getByTestId('health-nav-database').click();
	const screen = page.getByTestId('screen-health-database');
	await expect(screen).toBeVisible({ timeout: 30_000 });

	// ---- Oracle 1: manual check force-refreshes census totals (#1279). ----
	// Wait until the startup census pass has landed (totals fresh), so the
	// pre-fix behavior (fresh => skip) is what the click must override.
	await page.waitForTimeout(20_000);
	const probesBeforeClick = wire.censusProbes.length;
	const requestsBeforeClick = wire.allStoreRequests.length;
	console.log(`[soak] startup: ${probesBeforeClick} census probes seen before click`);
	const checkNow = screen.getByTestId('db-check-everything');
	await expect(checkNow).toBeEnabled({ timeout: 30_000 });
	await checkNow.click();
	try {
		// The manual sweep is a sequential lane loop; on a Luma-scale store the
		// change-signal tick's integrity escalation alone runs >60s before the
		// census lane is even reached — budget the full sweep.
		await expect
			.poll(() => wire.censusProbes.length - probesBeforeClick, { timeout: 240_000 })
			.toBeGreaterThanOrEqual(5); // 9 collections; allow probe coalescing/skips for live claims
	} catch (error) {
		console.log(
			`[soak] DEBUG post-click store traffic (${wire.allStoreRequests.length - requestsBeforeClick} requests):`
		);
		for (const line of wire.allStoreRequests.slice(requestsBeforeClick).slice(0, 60)) {
			console.log(`[soak]   ${line}`);
		}
		throw error;
	}
	console.log(
		`[soak] manual check fired ${wire.censusProbes.length - probesBeforeClick} census probes`
	);

	// ---- Oracles 2+3: idle soak. No interaction from here on. ----
	const productPagesBefore = wire.productTricklePages.length;
	const variationPullsBefore = wire.variationIncludePulls.length;
	const soakStart = Date.now();
	while (Date.now() - soakStart < IDLE_SOAK_MS) {
		await page.waitForTimeout(15_000);
		console.log(
			`[soak] t+${Math.round((Date.now() - soakStart) / 1000)}s ` +
				`productPages=${wire.productTricklePages.length - productPagesBefore} ` +
				`customerPages=${wire.customerTricklePages.length} ` +
				`variationPulls=${wire.variationIncludePulls.length - variationPullsBefore} ` +
				`census=${wire.censusProbes.length}`
		);
	}

	// ---- Oracle 3: variation-prefetch, gated on DERIVED eligibility. ----
	// Evaluated BEFORE the product-trickle assertion: these lanes fail
	// independently, and a
	// run must report every oracle it was able to evaluate, not just the first
	// to fail.
	const uncoveredParents = [...wire.variableParents.entries()].filter(([, variationIds]) =>
		variationIds.some((id) => !wire.fetchedVariationIds.has(id))
	);
	const idlePulls = wire.variationIncludePulls.length - variationPullsBefore;
	console.log(
		`[soak] variation eligibility: ${wire.variableParents.size} resident variable parent(s), ` +
			`${uncoveredParents.length} with variations this session never fetched, ` +
			`${idlePulls} idle include pull(s)`
	);
	if (uncoveredParents.length === 0) {
		// Not eligible: name WHICH cause applied and record it on the run, so a
		// green result is never mistaken for "variation-prefetch verified". An
		// annotation rather than test.skip() — skipping mid-test would abort and
		// discard the product-trickle oracle this same soak paid ten minutes for.
		const reason =
			wire.variableParents.size === 0
				? 'no published variable parent materialized in this session'
				: 'every resident variable parent already had its variations fetched this session';
		console.log(`[soak] variation oracle NOT EVALUATED — ${reason}`);
		testInfo.annotations.push({
			type: 'oracle-unavailable',
			description: `variation-prefetch: ${reason}`,
		});
	} else {
		expect
			.soft(
				idlePulls,
				`variation-prefetch fired no include pull while ${uncoveredParents.length} resident variable parent(s) still had unfetched variations (e.g. parent ${uncoveredParents[0]?.[0]})`
			)
			.toBeGreaterThanOrEqual(1);
	}

	if (wire.productTricklePages.length - productPagesBefore === 0) {
		console.log('[soak] DEBUG idle-window store traffic:');
		for (const line of wire.allStoreRequests.slice(-60)) {
			console.log(`[soak]   ${line}`);
		}
	}
	expect
		.soft(
			wire.productTricklePages.length - productPagesBefore,
			'product-trickle fired no ordered catalog page pull during the idle window'
		)
		.toBeGreaterThanOrEqual(1);
});
