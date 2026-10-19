import { type Route } from '@playwright/test';

import { expect, test } from './test';
import { authenticateWithStore } from './fixtures';

/** Past the app's 15 s site-probe timeout (use-api-discovery.ts), so the first Connect fails. */
const FIRST_SITE_PROBE_DELAY_MS = 17_000;

const isSiteProbe = (url: URL) =>
	url.pathname.includes('/wcpos/v2/site') ||
	(url.searchParams.get('rest_route') ?? '').includes('/wcpos/v2/site');

// Proves authenticateWithStore's Connect retry: the store answers the first site probe too
// late (as dev-next does under six shards), the app shows its timeout error, and the
// fixture presses Connect again instead of waiting out a label that can no longer come.
test('the login fixture presses Connect again when the first site probe times out', async ({
	page,
}, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'no store URL is configured for this project');
	test.slow();

	const storeOrigin = new URL(storeUrl!).origin;
	let siteProbes = 0;
	await page.route(
		(url) => url.origin === storeOrigin && isSiteProbe(url),
		async (route: Route) => {
			if (route.request().method() === 'OPTIONS' || ++siteProbes > 1) {
				await route.fallback();
				return;
			}
			// Hold the first probe until the app has given up on it; by then the
			// request is cancelled, so the abort may find nothing to abort.
			await new Promise((resolve) => setTimeout(resolve, FIRST_SITE_PROBE_DELAY_MS));
			await route.abort('timedout').catch(() => {});
		}
	);
	const sawConnectError = page
		.getByTestId('connect-error-message')
		.waitFor({ state: 'visible', timeout: 120_000 })
		.then(
			() => true,
			() => false
		);

	await authenticateWithStore(page, testInfo, { waitForCatalogue: false });

	expect(await sawConnectError, 'the first Connect must have failed with the timeout').toBe(true);
	expect(siteProbes, 'Connect must have been pressed again').toBeGreaterThanOrEqual(2);
});
