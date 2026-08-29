import { type Route } from '@playwright/test';

import { expect, test } from './test';
import { authenticateWithStore } from './fixtures';
import {
	createSearchProbe,
	deleteSearchProbe,
	mintSearchProbeToken,
	productWriterAuthorization,
	searchAndWaitForServer,
} from './search-probe';

test('connects and finds an owned product through query-form REST when path routes are blocked', async ({
	page,
	request,
}, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	// Create-and-find (store-agnostic policy): the spec owns the record it
	// asserts. The probe API rides APIRequestContext, outside the page, so the
	// path-form block below never touches it — and probeRequest tolerates both
	// permalink styles on its own.
	const writerAuthorization = await productWriterAuthorization(request, storeUrl!);
	test.skip(!writerAuthorization, 'E2E_PRODUCT_WRITER_USER/_PASS are not configured');
	const token = mintSearchProbeToken(testInfo.workerIndex);
	const created = await createSearchProbe({
		request,
		storeUrl: storeUrl!,
		authorization: writerAuthorization!,
		collection: 'products',
		workerIndex: testInfo.workerIndex,
		token,
		writerConfigured: true,
		productData: { name: `E2E Probe ${token} transport` },
	});
	if (!created.ok) {
		throw new Error(created.reason);
	}
	if (!created.probe.rowTestId) {
		throw new Error('Transport probe product is missing its slug-derived row testID');
	}

	try {
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
		const searchInput = page.getByTestId('search-products');
		await expect(searchInput).toBeVisible();
		await searchAndWaitForServer(page, searchInput, 'products', token);

		const posScreen = page.getByTestId('screen-pos').filter({ visible: true });
		const tile = posScreen.getByTestId(`product-tile-${created.probe.id}`);
		const row = posScreen.getByTestId(created.probe.rowTestId);
		await expect(tile.or(row).first()).toBeVisible({ timeout: 30_000 });
		expect(new URL((await queryEngineRequest).url()).searchParams.has('rest_route')).toBe(true);
	} finally {
		await deleteSearchProbe({
			request,
			storeUrl: storeUrl!,
			authorization: writerAuthorization!,
			collection: 'products',
			id: created.probe.id,
		});
	}
});
