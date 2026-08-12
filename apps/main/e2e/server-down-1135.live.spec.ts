import { expect, test } from '@playwright/test';

import { authenticateWithStore, navigateToPage } from './fixtures';

import type { Page } from '@playwright/test';

/**
 * #1135 — server-down feedback must be cashier-visible (live proof).
 *
 * The original desktop report: with the store's backend dead behind a live
 * proxy (nginx/Cloudflare answering 502), the header dot stayed GREEN and the
 * Database page's Retry gave no feedback. The unit suites pin the transport
 * logic; this spec proves the full loop against a real session: authenticate
 * against the live store, then answer every subsequent store request with 502
 * (exactly the proxy-up/backend-dead shape) and assert the cashier sees it.
 *
 * Not in the CI matrix — `.live.spec.ts`, run by hand after a deploy:
 *   BASE_URL=<client deployment> npx playwright test -c playwright.verify1135.config.ts
 *
 * Store-agnostic: no catalog contents are asserted; the outage is injected at
 * the network layer, so any store the fixtures can authenticate against works.
 */

// The reachability tick fires every 30s, but a tick inside 45s of the last
// good network pulse trusts the pulse and skips the probe (use-online-status.web
// interval effect). Worst case the first PROBING tick is ~75s after the outage
// starts: pulse at T0 → T+30 tick trusts it → T+60 tick probes → amber. Budget
// that path plus probe time and slack.
const PROBE_FLIP_TIMEOUT_MS = 100_000;

// Hold each 502 response briefly so the manual sync stays observably in flight
// — the loading state on the button was half the original complaint.
const OUTAGE_RESPONSE_DELAY_MS = 1_200;

/**
 * Answer every request to the store origin with a 502, after a short delay.
 * Never throws from the route handler (#997): if fulfilling fails (page began
 * navigating, request already handled), fall back to the live network.
 */
async function injectStoreOutage(page: Page, storeOrigin: string) {
	await page.context().route(
		(url) => url.href.startsWith(storeOrigin),
		async (route) => {
			try {
				await new Promise((resolve) => setTimeout(resolve, OUTAGE_RESPONSE_DELAY_MS));
				await route.fulfill({
					status: 502,
					contentType: 'text/html',
					body: '<html><body><h1>502 Bad Gateway</h1></body></html>',
				});
			} catch {
				try {
					await route.fallback();
				} catch {
					// Request already settled — nothing to do.
				}
			}
		}
	);
}

test.describe('#1135 server-down feedback (live store)', () => {
	test('dot goes amber and manual sync spins + toasts once the backend dies', async ({
		page,
	}, testInfo) => {
		const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
		test.skip(!storeUrl, 'project storeUrl missing — nothing to take offline');

		await authenticateWithStore(page, testInfo, { waitForCatalogue: false });

		// Healthy baseline: the dot reports online (green) before the outage.
		const dot = page.getByTestId('header-online-status');
		await expect(dot).toBeVisible({ timeout: 30_000 });
		await expect(dot.locator('.text-success')).toBeVisible({ timeout: PROBE_FLIP_TIMEOUT_MS });

		// Backend dies: proxy still answers, but everything is a 502 from here on.
		await injectStoreOutage(page, new URL(storeUrl!).origin);

		// 1. The dot must flip to amber within one probe interval — this exact
		//    shape (readable 5xx) used to count as "reachable" and stay green.
		await expect(dot.locator('.text-warning')).toBeVisible({ timeout: PROBE_FLIP_TIMEOUT_MS });

		// 2. Manual sync must give feedback instead of silently doing nothing.
		await navigateToPage(page, 'health');
		await page.getByTestId('health-nav-database').click();
		const screen = page.getByTestId('screen-health-database');
		await expect(screen).toBeVisible({ timeout: 30_000 });

		const checkNow = screen.getByTestId('db-check-everything');
		await expect(checkNow).toBeVisible({ timeout: 15_000 });
		await checkNow.click();

		// The button enters its loading state (auto-disabled) while the sync is
		// in flight — the 502s are delayed above so this window is observable.
		await expect(checkNow).toBeDisabled({ timeout: 5_000 });

		// And the outcome lands as a cashier-readable error toast.
		await expect(
			page.locator('[data-sonner-toast]', { hasText: 'sync with the server' }).first()
		).toBeVisible({ timeout: 60_000 });
	});
});
