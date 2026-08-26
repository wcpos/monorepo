import { expect, type Page } from '@playwright/test';

import { authenticatedTest, getStoreUrl, hydrateAuthenticatedPage } from './fixtures';

/**
 * The server's protocol-gate refusal (wcpos/woocommerce-pos#1752; client
 * mono#1599): a store whose plugin has crossed the 1.11.0 boundary answers
 * every sync request with a deliberate 426 `wcpos_update_required` envelope.
 * The client must render the blocking update screen and — the politeness
 * half — latch sync shut instead of hammering a store that will refuse
 * every request until the app updates.
 *
 * The refusal is installed AFTER hydration, which is also the real rollout
 * shape: a till mid-session when the store's plugin upgrades past it.
 */

const REFUSAL_BODY = JSON.stringify({
	code: 'wcpos_update_required',
	message: 'This store requires a newer version of WCPOS.',
	data: { status: 426, min_protocol: 2, server_protocol: 2, plugin_version: '1.11.0' },
});

const test = authenticatedTest.extend({
	posPage: async ({ page }, use, testInfo) => {
		await hydrateAuthenticatedPage(page, testInfo, { waitForCatalogue: false });
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API
		await use(page);
	},
});

/** Count of refused sync requests that actually reached the (mock) server. */
async function installProtocolGate(page: Page, storeUrl: string): Promise<{ count(): number }> {
	const storeOrigin = new URL(storeUrl).origin;
	let refused = 0;
	await page.route('**/*', async (route) => {
		const request = route.request();
		let url: URL;
		try {
			url = new URL(request.url());
		} catch {
			await route.fallback();
			return;
		}
		const routePath = url.searchParams.get('rest_route') ?? url.pathname;
		const gated =
			url.origin === storeOrigin &&
			routePath.includes('/wcpos/v2/') &&
			// The real gate carves out the transport/auth probes so a refused
			// client can still negotiate and re-authenticate.
			!routePath.includes('/echo') &&
			!routePath.includes('/auth/');
		if (!gated) {
			await route.fallback();
			return;
		}
		// Every mocked cross-origin response needs CORS headers, and the same
		// matcher must answer the preflight — a fulfill without them is rejected
		// as a network error and silently rewrites the condition under test.
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
		refused += 1;
		await route.fulfill({
			status: 426,
			headers: {
				'access-control-allow-origin': '*',
				'cache-control': 'no-store',
				'content-type': 'application/json; charset=UTF-8',
			},
			body: REFUSAL_BODY,
		});
	});
	return { count: () => refused };
}

test('the gate refusal renders the blocking update screen and sync goes quiet', async ({
	posPage: page,
}, testInfo) => {
	const gate = await installProtocolGate(page, getStoreUrl(testInfo));

	// The change-signal cadence delivers the first refusal within its normal
	// tick; the engine latches and the layout swaps to the blocking screen.
	const screen = page.getByTestId('update-required-screen');
	await expect(screen).toBeVisible({ timeout: 90_000 });
	await expect(page.getByTestId('update-required-docs-link-SYNC341')).toBeVisible();
	// Web offers the reload CTA (the web bundle auto-updates on reload).
	await expect(page.getByTestId('update-required-reload')).toBeVisible();

	// Politeness: the transport latch replays the refusal locally, so once the
	// screen is up the store must see (almost) no further sync traffic. A
	// small allowance covers requests already in flight when the latch set.
	await page.waitForTimeout(1_000);
	const latchedAt = gate.count();
	await page.waitForTimeout(6_000);
	expect(
		gate.count() - latchedAt,
		'sync traffic kept flowing after the update-required latch'
	).toBeLessThanOrEqual(1);

	// The screen is the surface — the refusal must not spray error toasts.
	await expect(page.getByTestId('error-toast')).toHaveCount(0);
});
