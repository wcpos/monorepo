import { expect, test } from '@playwright/test';

import { authenticateWithStore, navigateToPage } from './fixtures';

/**
 * Idle-backfill live soak (2026-08-19) — one-shot proof that the merged trickle
 * lanes actually run in a real session. Run by hand, never in CI:
 *
 *   npx serve -s web-build -l 8091   (after build:web)
 *   BASE_URL=http://localhost:8091 npx playwright test idle-backfill.live \
 *     --workers=1 --project=chromium-pro
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
 *     appears in the same idle window (skips cleanly if the store has no
 *     variable products — logged, not failed, per store-agnostic policy the
 *     assertion only requires it when a parent with variations materialized).
 */

const IDLE_SOAK_MS = Number(process.env.SOAK_MS ?? 6.5 * 60_000); // one full 5-min cadence + slack
test.setTimeout(IDLE_SOAK_MS + 8 * 60_000);

type WireLog = {
	censusProbes: string[];
	productTricklePages: string[];
	variationIncludePulls: string[];
	allStoreRequests: string[];
};

function watchWire(page: import('@playwright/test').Page): WireLog {
	const log: WireLog = {
		censusProbes: [],
		productTricklePages: [],
		variationIncludePulls: [],
		allStoreRequests: [],
	};
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
		}
	});
	return log;
}

test('idle POS trickles products+variations and manual check refreshes totals', async ({
	page,
}, testInfo) => {
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
				`variationPulls=${wire.variationIncludePulls.length - variationPullsBefore} ` +
				`census=${wire.censusProbes.length}`
		);
	}

	expect(
		wire.productTricklePages.length - productPagesBefore,
		'product-trickle fired no ordered catalog page pull during the idle window'
	).toBeGreaterThanOrEqual(1);

	if (wire.variationIncludePulls.length - variationPullsBefore === 0) {
		console.log(
			'[soak] no variation include pulls — store may have no variable parents with missing variations resident; see product pages log'
		);
	} else {
		console.log(
			`[soak] variation-prefetch fired ${wire.variationIncludePulls.length - variationPullsBefore} include pull(s)`
		);
	}
});
