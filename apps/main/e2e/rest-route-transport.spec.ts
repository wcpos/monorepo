import { expect, type Route, test } from '@playwright/test';

import { LOADED_COUNT_READY, LOADED_COUNT_TEST_ID } from './catalogue-readiness';
import { authenticateWithStore } from './fixtures';

test('connects and loads products through query-form REST when path routes are blocked', async ({
	page,
}, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	const storeOrigin = new URL(storeUrl!).origin;
	const blockStorePathRest = async (route: Route) => {
		if (new URL(route.request().url()).origin !== storeOrigin) {
			await route.continue();
			return;
		}
		await route.fulfill({ status: 404, contentType: 'text/plain', body: 'blocked by E2E' });
	};
	await page.route('**/wp-json/wcpos/**', blockStorePathRest);
	await page.route('**/wp-json/wc/**', blockStorePathRest);

	const queryEngineRequest = page.waitForRequest(
		(request) => {
			const url = new URL(request.url());
			return (
				url.origin === storeOrigin &&
				url.searchParams.get('rest_route')?.startsWith('/wcpos/v2/products') === true
			);
		},
		{ timeout: 180_000 }
	);

	await authenticateWithStore(page, testInfo, { waitForCatalogue: true });
	await expect(page.getByTestId('search-products')).toBeVisible();
	await expect(page.getByTestId(LOADED_COUNT_TEST_ID)).toHaveText(LOADED_COUNT_READY);
	expect(new URL((await queryEngineRequest).url()).searchParams.has('rest_route')).toBe(true);
});
