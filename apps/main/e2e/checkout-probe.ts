import {
	type APIRequestContext,
	expect,
	type Locator,
	type Page,
	request as playwrightRequest,
	type WorkerInfo,
} from '@playwright/test';

import { authenticatedTest, type StoreAuthorization, tryAddProductBySku } from './fixtures';
import {
	createRunPrivateProduct,
	deleteSearchProbe,
	productWriterAuthorization,
	productWriterCredentialsConfigured,
	searchAndWaitForServer,
	type SearchProbe,
	sweepOrphanedProductProbes,
} from './search-probe';

import type { WcposTestOptions } from '../playwright.config';

type ProductProbeWorkerFixtures = {
	productProbeRequest: APIRequestContext;
	productWriter: StoreAuthorization | null;
};

type SimpleProductProbeWorkerFixtures = {
	runPrivateSimpleProducts: SearchProbe[] | null;
};

type VariableProductProbeWorkerFixtures = {
	runPrivateVariableProduct: SearchProbe | null;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no new test-scoped fixtures.
type ProductProbeTestFixtures = {};

const simpleProbesByPage = new WeakMap<Page, SearchProbe[] | null>();
const variableProbeByPage = new WeakMap<Page, SearchProbe | null>();

function workerStoreUrl(workerInfo: WorkerInfo): string {
	if (process.env.E2E_STORE_URL) return process.env.E2E_STORE_URL;
	return (workerInfo.project.use as WcposTestOptions).storeUrl || 'https://dev-free.wcpos.com';
}

/**
 * Worker-private products are reused by that worker's serial test executions,
 * but their random tokens keep concurrent workers and CI runs disjoint.
 */
const productProbeTest = authenticatedTest.extend<
	ProductProbeTestFixtures,
	ProductProbeWorkerFixtures
>({
	productProbeRequest: [
		// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
		async ({}, use) => {
			const request = await playwrightRequest.newContext();
			try {
				// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook.
				await use(request);
			} finally {
				await request.dispose();
			}
		},
		{ scope: 'worker' },
	],
	productWriter: [
		async ({ productProbeRequest }, use, workerInfo) => {
			if (!productWriterCredentialsConfigured()) {
				await use(null);
				return;
			}
			const writer = await productWriterAuthorization(
				productProbeRequest,
				workerStoreUrl(workerInfo)
			);
			try {
				// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook.
				await use(writer);
			} finally {
				await sweepOrphanedProductProbes({
					request: productProbeRequest,
					storeUrl: workerStoreUrl(workerInfo),
					authorization: writer,
				});
			}
		},
		{ scope: 'worker' },
	],
});

/** Simple-product suites provision only their two checkout products. */
export const isolatedProductTest = productProbeTest.extend<
	ProductProbeTestFixtures,
	SimpleProductProbeWorkerFixtures
>({
	runPrivateSimpleProducts: [
		async ({ productProbeRequest, productWriter }, use, workerInfo) => {
			if (!productWriter) {
				await use(null);
				return;
			}
			const probes: SearchProbe[] = [];
			try {
				for (let index = 0; index < 2; index += 1) {
					probes.push(
						await createRunPrivateProduct({
							request: productProbeRequest,
							storeUrl: workerStoreUrl(workerInfo),
							authorization: productWriter,
							kind: 'simple',
							workerIndex: workerInfo.workerIndex,
						})
					);
				}
				// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook.
				await use(probes);
			} finally {
				for (const probe of probes) {
					await deleteSearchProbe({
						request: productProbeRequest,
						storeUrl: workerStoreUrl(workerInfo),
						authorization: productWriter,
						collection: 'products',
						id: probe.id,
					});
				}
			}
		},
		{ scope: 'worker' },
	],
	posPage: async ({ posPage, runPrivateSimpleProducts }, use) => {
		simpleProbesByPage.set(posPage, runPrivateSimpleProducts);
		try {
			// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook.
			await use(posPage);
		} finally {
			simpleProbesByPage.delete(posPage);
		}
	},
});

/** Variable-product suites opt into variation provisioning without coupling checkout-only suites. */
export const isolatedVariableProductTest = productProbeTest.extend<
	ProductProbeTestFixtures,
	VariableProductProbeWorkerFixtures
>({
	runPrivateVariableProduct: [
		async ({ productProbeRequest, productWriter }, use, workerInfo) => {
			if (!productWriter) {
				await use(null);
				return;
			}
			const probe = await createRunPrivateProduct({
				request: productProbeRequest,
				storeUrl: workerStoreUrl(workerInfo),
				authorization: productWriter,
				kind: 'variable',
				workerIndex: workerInfo.workerIndex,
			});
			try {
				// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook.
				await use(probe);
			} finally {
				await deleteSearchProbe({
					request: productProbeRequest,
					storeUrl: workerStoreUrl(workerInfo),
					authorization: productWriter,
					collection: 'products',
					id: probe.id,
				});
			}
		},
		{ scope: 'worker' },
	],
	posPage: async ({ posPage, runPrivateVariableProduct }, use) => {
		variableProbeByPage.set(posPage, runPrivateVariableProduct);
		try {
			// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture API, not a React hook.
			await use(posPage);
		} finally {
			variableProbeByPage.delete(posPage);
		}
	},
});

/** Bring the worker-private simple product resident and add it when provisioned. */
export async function tryAddRunPrivateSimpleProduct(page: Page, index = 0): Promise<boolean> {
	const probes = simpleProbesByPage.get(page);
	if (probes === undefined) {
		throw new Error(
			'tryAddRunPrivateSimpleProduct requires isolatedProductTest fixture registration'
		);
	}
	const probe = probes?.[index] ?? null;
	if (probe) {
		if (!probe.rowTestId) {
			throw new Error('Run-private simple product is missing its slug-derived row testID');
		}
		await searchAndWaitForServer(
			page,
			page.getByTestId('search-products'),
			'products',
			probe.token
		);
		const posScreen = page.getByTestId('screen-pos').filter({ visible: true });
		// Fail FAST and by name when the POS root testID is missing: every lookup
		// below scopes under it, and a layout variant that drops the testID
		// otherwise surfaces as an unrelated 3-minute tile/fill timeout (#1106 —
		// the (columns) desktop layout shipped without it and the lane was red
		// for a day before the real cause was found).
		await expect(
			posScreen.first(),
			"POS root testID 'screen-pos' not visible — every POS layout variant must stamp it (#1106)"
		).toBeVisible({ timeout: 5_000 });
		const tile = posScreen.getByTestId(`product-tile-${probe.id}`);
		const tableButton = posScreen.getByTestId(probe.rowTestId).getByTestId('add-to-cart-button');
		await expect(tile.or(tableButton).first()).toBeVisible({ timeout: 30_000 });
		if (await tile.isVisible()) await tile.click();
		else await tableButton.click();
		await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
		return true;
	}
	return false;
}

/** Add the private product, retaining the shared-SKU fallback for secretless forks. */
export async function addCheckoutProbeProduct(page: Page): Promise<void> {
	if (await tryAddRunPrivateSimpleProduct(page)) return;

	// Forks do not receive writer secrets: keep the old shared-SKU path running
	// rather than skipping checkout coverage solely because provisioning is absent.
	const skuResult = await tryAddProductBySku(page);
	if (skuResult === 'added') return;
	if (skuResult === 'add_failed') {
		throw new Error('Fallback E2E SKU matched but did not reach the cart');
	}

	const tile = page.getByTestId('product-tile').first();
	const tableButton = page.getByTestId('add-to-cart-button').first();
	await expect(tile.or(tableButton).first()).toBeVisible({ timeout: 30_000 });
	if (await tile.isVisible()) await tile.click();
	else await tableButton.click();
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
}

/** Search a private variable product, with the current sample-data fallback for forks. */
export async function findVariableProduct(page: Page, search: Locator): Promise<void> {
	const probe = variableProbeByPage.get(page);
	if (probe === undefined) {
		throw new Error(
			'findVariableProduct requires isolatedVariableProductTest fixture registration'
		);
	}
	// Callers pass a search locator scoped under 'screen-pos'; pin the root
	// fast so a layout variant missing the testID names itself instead of
	// surfacing as a 3-minute fill timeout (#1106).
	await expect(
		page.getByTestId('screen-pos').first(),
		"POS root testID 'screen-pos' not visible — every POS layout variant must stamp it (#1106)"
	).toBeVisible({ timeout: 5_000 });
	if (probe) {
		await searchAndWaitForServer(page, search, 'products', probe.token);
		return;
	}

	// Forks have no writer credentials, so preserve the existing shared-catalog path.
	await search.fill('hoodie');
	await page.waitForTimeout(2_000);
}
