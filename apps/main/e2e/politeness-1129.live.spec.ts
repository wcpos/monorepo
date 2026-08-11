import { expect, test } from '@playwright/test';

import { authenticateWithStore, navigateToPage } from './fixtures';

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
 * the browser open past the 60s rebaseline audit hold (~3 minutes total) and its whole
 * point is the live server.
 *
 * Store-agnostic by construction: it asserts REQUEST-SHAPE ceilings from the politeness
 * invariant (wiki ADR 2026-08-11), never catalog contents or counts. The first open
 * seeds the manifests; the RELOAD is the measured scenario — a populated-manifest
 * rebaseline, the profile that used to produce the flood.
 *
 * Run:
 *   BASE_URL=<client deployment> npx playwright test -c playwright.politeness1129.config.ts
 */

const AUDIT_HOLD_MS = 60_000; // REBASELINE_AUDIT_DELAY_MS in the engine
const AUDIT_SETTLE_MS = 45_000; // margin for the held audit chain to run its tick

// Ceilings from the lane registry: 3 id-spaces × 3 gap-skipping scan pages, K=2 drills.
const MAX_SCAN_REQUESTS = 9;
const MAX_BUCKET_REQUESTS = 2;

type SyncRequest = { path: string; atMs: number };

function politenessProfile(requests: SyncRequest[], beforeMs: number) {
	const audit = (path: string) => /\/integrity\/|\/digests(\?|$)/.test(path);
	return {
		auditBeforeRender: requests.filter((request) => audit(request.path) && request.atMs < beforeMs),
		scans: requests.filter((request) => request.path.includes('/integrity/scan')),
		buckets: requests.filter((request) => request.path.includes('/integrity/bucket')),
	};
}

test.describe('#1129 — store-open politeness against the live server', () => {
	test('a populated-manifest reopen keeps audit traffic out of the open window and within ceilings', async ({
		page,
	}, testInfo) => {
		test.setTimeout(360_000);

		// --- First open: authenticate and let the catalog seed populate the manifests.
		await authenticateWithStore(page, testInfo, { waitForCatalogue: true });
		await navigateToPage(page, 'products');
		const firstProducts = page.getByTestId('screen-products').filter({ visible: true });
		await expect(firstProducts.getByTestId('search-products')).toBeVisible({ timeout: 120_000 });
		// Give the seed + digest-on-pull population a window to fill the manifests the
		// measured reopen will walk. (No content assertions — any store shape is fine.)
		await page.waitForTimeout(30_000);

		// --- Measured scenario: reload = rebaseline with populated manifests (the HAR shape).
		const requests: SyncRequest[] = [];
		const startedAt = Date.now();
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('/wcpos/v2/')) {
				requests.push({ path: new URL(url).pathname + new URL(url).search, atMs: Date.now() });
			}
		});
		await page.reload();

		const products = page.getByTestId('screen-products').filter({ visible: true });
		await expect(products.getByTestId('search-products')).toBeVisible({ timeout: 120_000 });
		const renderedAtMs = Date.now();

		// Invariant 1: the cashier's open window carries ZERO audit traffic.
		const openWindow = politenessProfile(requests, renderedAtMs);
		expect(
			openWindow.auditBeforeRender.map(({ path }) => path),
			'audit traffic before first catalog render'
		).toEqual([]);

		// --- Let the 60s hold elapse and the audit chain run one pass.
		await page.waitForTimeout(AUDIT_HOLD_MS + AUDIT_SETTLE_MS);

		const profile = politenessProfile(requests, Number.POSITIVE_INFINITY);
		const observed = `total v2 requests=${requests.length}, scan=${profile.scans.length}, bucket=${profile.buckets.length}, render window=${renderedAtMs - startedAt}ms`;
		// Console too — the list reporter drops annotations, and the observed counts ARE
		// the verification record this spec exists to produce.
		console.log(`[politeness-1129] ${observed}`);
		test.info().annotations.push({ type: 'observed', description: observed });

		// Invariant 2: the audit pass costs scan pages, not a per-bucket walk. The old
		// behavior produced 41 integrity/bucket fetches here; the ceiling is K=2.
		expect(profile.scans.length, 'scan aggregate pages').toBeLessThanOrEqual(MAX_SCAN_REQUESTS);
		expect(profile.buckets.length, 'integrity/bucket drill-downs').toBeLessThanOrEqual(
			MAX_BUCKET_REQUESTS
		);
	});
});
