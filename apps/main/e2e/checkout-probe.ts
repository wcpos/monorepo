import {
	type APIRequestContext,
	expect,
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
} from './search-probe';

import type { WcposTestOptions } from '../playwright.config';

type ProductProbeWorkerFixtures = {
	productProbeRequest: APIRequestContext;
	productWriter: StoreAuthorization | null;
	runPrivateSimpleProducts: SearchProbe[] | null;
	runPrivateVariableProduct: SearchProbe | null;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no new test-scoped fixtures.
type ProductProbeTestFixtures = {};

const simpleProbesByPage = new WeakMap<Page, SearchProbe[] | null>();
const variableProbeByPage = new WeakMap<Page, SearchProbe | null>();

function workerStoreUrl(workerInfo: WorkerInfo): string {
	return (workerInfo.project.use as WcposTestOptions).storeUrl;
}

/**
 * Worker-private products are reused by that worker's serial test executions,
 * but their random tokens keep concurrent workers and CI runs disjoint.
 */
export const isolatedProductTest = authenticatedTest.extend<
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
			await use(await productWriterAuthorization(productProbeRequest, workerStoreUrl(workerInfo)));
		},
		{ scope: 'worker' },
	],
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
export const isolatedVariableProductTest = isolatedProductTest.extend({
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
		throw new Error('Run-private product helper requires isolatedProductTest');
	}
	const probe = probes?.[index] ?? null;
	if (probe) {
		await searchAndWaitForServer(
			page,
			page.getByTestId('search-products'),
			'products',
			probe.token
		);
		const tile = page.getByTestId('product-tile').first();
		const tableButton = page.getByTestId('add-to-cart-button').first();
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
export async function findVariableProduct(page: Page): Promise<void> {
	const probe = variableProbeByPage.get(page);
	if (probe === undefined) {
		throw new Error('Run-private product helper requires isolatedProductTest');
	}
	const search = page.getByTestId('search-products');
	if (probe) {
		await searchAndWaitForServer(page, search, 'products', probe.token);
		return;
	}

	// Forks have no writer credentials, so preserve the existing shared-catalog path.
	await search.fill('hoodie');
	await page.waitForTimeout(2_000);
}
