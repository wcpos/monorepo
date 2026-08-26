import { expect } from '@playwright/test';

import { findVariableProduct, isolatedVariableProductTest as test } from './checkout-probe';
import {
	getStoreUrl,
	getStoreVariant,
	isWcposRestRoute,
	navigateToPage,
	type StoreAuthorization,
} from './fixtures';
import {
	createSearchProbe,
	deleteSearchProbe,
	fetchProductRecord,
	mintSearchProbeToken,
	productWriterAuthorization,
	productWriterCredentialsConfigured,
	searchAndWaitForServer,
} from './search-probe';
import { rewrapWireBody, unwrapWireBody } from './wire-envelope';

import type { APIRequestContext, Page, Response, Route, TestInfo } from '@playwright/test';

/** Matches the app's mutation push for products in both permalink styles. */
function isPushProductsUrl(url: URL): boolean {
	return (
		url.pathname.endsWith('/wcpos/v2/push/products') ||
		url.searchParams.get('rest_route') === '/wcpos/v2/push/products'
	);
}

function isPushProductsResponse(response: Response): boolean {
	if (response.request().method() !== 'POST') return false;
	return isPushProductsUrl(new URL(response.url()));
}

/**
 * Locate the probe row's stock cell and type a new quantity through the numpad
 * popover. Returns the cell locator so callers can assert on its rendered text.
 */
async function editStockQuantityViaNumpad(page: Page, rowTestId: string, digit: string) {
	const screen = page.getByTestId('screen-products').filter({ visible: true });
	const row = screen.getByTestId(rowTestId);
	const cell = row.getByTestId('stock-quantity-input');
	await expect(cell).toBeVisible({ timeout: 30_000 });
	// #1094 (capability UI) will disable this cell for cashiers without catalog
	// write capability — that is a declared-missing environment, not a failure.
	const disabled = await cell.evaluate(
		(el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
	);
	if (disabled) {
		test.skip(
			true,
			'Stock cell is disabled: the signed-in cashier has no catalog write capability on this store'
		);
	}
	await expect(cell).toHaveText('0', { timeout: 15_000 });
	await cell.click();
	const key = page.locator(`[data-testid="numpad-key-${digit}"]:visible`);
	await expect(key).toBeVisible({ timeout: 15_000 });
	await key.click();
	await page.locator('[data-testid="numpad-done-button"]:visible').click();
	return cell;
}

/**
 * Products page (pro-only drawer page with inline editing).
 */
test.describe('Products Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Products page requires Pro');
	});

	test('should navigate to Products page and see product table', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.locator('[data-testid="screen-products"]:visible');
		await expect(screen.getByTestId('search-products')).toBeVisible({
			timeout: 30_000,
		});
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});
	});

	test('should show stock and price columns on Products page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.locator('[data-testid="screen-products"]:visible');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		const columnheaders = screen.getByRole('columnheader');
		expect(await columnheaders.count()).toBeGreaterThanOrEqual(3);
	});

	test('should reorder rows when clicking the Name column header on Products page', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const writerAuthorization = await productWriterAuthorization(request, storeUrl);
		const authorization = writerAuthorization ?? storeAuthorization();
		const token = mintSearchProbeToken(testInfo.workerIndex);
		const alpha = await createSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'products',
			workerIndex: testInfo.workerIndex,
			token,
			writerConfigured: Boolean(writerAuthorization),
			productData: { name: `E2E Probe ${token} alpha` },
		});
		if (!alpha.ok) {
			const reason = writerAuthorization
				? alpha.reason
				: `${alpha.reason} (E2E_PRODUCT_WRITER_USER/_PASS are not configured)`;
			test.skip(true, reason);
			return;
		}
		const zulu = await createSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'products',
			workerIndex: testInfo.workerIndex,
			token,
			writerConfigured: Boolean(writerAuthorization),
			productData: { name: `E2E Probe ${token} zulu` },
		});
		if (!zulu.ok) {
			await deleteSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: alpha.probe.collection,
				id: alpha.probe.id,
			});
			const reason = writerAuthorization
				? zulu.reason
				: `${zulu.reason} (E2E_PRODUCT_WRITER_USER/_PASS are not configured)`;
			test.skip(true, reason);
			return;
		}

		try {
			if (!alpha.probe.rowTestId || !zulu.probe.rowTestId) {
				throw new Error('Product sort probe is missing its WC response slug-derived row testID');
			}
			await navigateToPage(page, 'products');
			const screen = page.locator('[data-testid="screen-products"]:visible');
			await expect(screen.getByTestId('data-table-count')).toBeVisible({
				timeout: 60_000,
			});

			const searchInput = screen.getByTestId('search-products');
			await searchAndWaitForServer(page, searchInput, 'products', token);

			const alphaRow = screen.getByTestId(alpha.probe.rowTestId).first();
			const zuluRow = screen.getByTestId(zulu.probe.rowTestId).first();
			await expect(alphaRow).toBeVisible({ timeout: 30_000 });
			await expect(zuluRow).toBeVisible({ timeout: 30_000 });

			const getRowOrder = async () => {
				return Promise.all(
					[alphaRow, zuluRow].map(async (row) => (await row.boundingBox())?.y ?? -1)
				);
			};

			const [initialAlphaY, initialZuluY] = await getRowOrder();
			expect(initialAlphaY).toBeGreaterThan(0);
			expect(initialZuluY).toBeGreaterThan(0);
			expect(initialAlphaY).not.toBe(initialZuluY);
			const initialSortDirection = Math.sign(initialAlphaY - initialZuluY);

			const productSortControl = screen.getByTestId('data-table-header-name').first();
			await expect(productSortControl).toBeVisible({ timeout: 15_000 });
			await productSortControl.click();

			const getSortDirection = async () => {
				const [alphaY, zuluY] = await getRowOrder();
				return Math.sign(alphaY - zuluY);
			};

			try {
				await expect.poll(getSortDirection, { timeout: 8_000 }).toBe(initialSortDirection * -1);
			} catch {
				// First click can set the current sort direction instead of toggling it.
				await productSortControl.click();
				await expect.poll(getSortDirection, { timeout: 15_000 }).toBe(initialSortDirection * -1);
			}
		} finally {
			for (const probe of [alpha.probe, zulu.probe]) {
				await deleteSearchProbe({
					request,
					storeUrl,
					authorization,
					collection: probe.collection,
					id: probe.id,
				});
			}
		}
	});

	test('should search products on Products page', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		// Catalog writes are deliberately closed to POS cashiers, so the probe
		// prefers the optional CI product-writer credentials and falls back to
		// the captured auth (whose 403 becomes the skip below).
		const writerAuthorization = await productWriterAuthorization(request, storeUrl);
		const authorization = writerAuthorization ?? storeAuthorization();
		const created = await createSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'products',
			workerIndex: testInfo.workerIndex,
			writerConfigured: productWriterCredentialsConfigured(),
		});
		if (!created.ok) {
			const hint = writerAuthorization
				? created.reason
				: `${created.reason} (set the E2E_PRODUCT_WRITER_USER/_PASS secrets to enable this spec)`;
			test.skip(true, hint);
			return;
		}
		if (!created.probe.rowTestId) {
			throw new Error('Product search probe is missing its WC response slug-derived row testID');
		}

		try {
			await navigateToPage(page, 'products');
			const screen = page.getByTestId('screen-products').filter({ visible: true });
			const searchInput = screen.getByTestId('search-products');
			await expect(searchInput).toBeVisible({ timeout: 30_000 });

			await searchAndWaitForServer(page, searchInput, 'products', created.probe.token);

			await expect(screen.getByTestId(created.probe.rowTestId)).toBeVisible({
				timeout: 30_000,
			});
			await expect
				.poll(() => screen.getByTestId(/^data-table-row-/).count(), { timeout: 30_000 })
				.toBeGreaterThanOrEqual(1);
		} finally {
			await deleteSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: created.probe.collection,
				id: created.probe.id,
			});
		}
	});

	/**
	 * Inline stock-qty edit coverage (#1088). Both specs act on a worker-private
	 * out-of-stock probe (manage_stock on, qty 0) so the store's own catalog is
	 * never mutated and the row's testID is derived from the probe's WC slug.
	 */
	async function createStockEditProbe(
		request: APIRequestContext,
		storeAuthorization: () => StoreAuthorization | null,
		testInfo: TestInfo
	) {
		const storeUrl = getStoreUrl(testInfo);
		const writerAuthorization = await productWriterAuthorization(request, storeUrl);
		const authorization = writerAuthorization ?? storeAuthorization();
		const created = await createSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'products',
			workerIndex: testInfo.workerIndex,
			writerConfigured: productWriterCredentialsConfigured(),
			productData: { manage_stock: true, stock_quantity: 0 },
		});
		if (!created.ok) {
			const hint = writerAuthorization
				? created.reason
				: `${created.reason} (set the E2E_PRODUCT_WRITER_USER/_PASS secrets to enable this spec)`;
			test.skip(true, hint);
			throw new Error('unreachable');
		}
		if (!created.probe.rowTestId) {
			throw new Error('Stock-edit probe is missing its WC response slug-derived row testID');
		}
		return { storeUrl, authorization, probe: created.probe, rowTestId: created.probe.rowTestId };
	}

	test('should inline edit stock quantity and push the change to the server', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const { storeUrl, authorization, probe, rowTestId } = await createStockEditProbe(
			request,
			storeAuthorization,
			testInfo
		);

		try {
			await navigateToPage(page, 'products');
			const screen = page.getByTestId('screen-products').filter({ visible: true });
			const searchInput = screen.getByTestId('search-products');
			await expect(searchInput).toBeVisible({ timeout: 30_000 });
			await searchAndWaitForServer(page, searchInput, 'products', probe.token);
			await expect(screen.getByTestId(rowTestId)).toBeVisible({ timeout: 30_000 });

			const pushResponsePending = page.waitForResponse(isPushProductsResponse, {
				timeout: 60_000,
			});
			pushResponsePending.catch(() => {});

			const cell = await editStockQuantityViaNumpad(page, rowTestId, '7');

			// Optimistic outcome: green enqueue toast + the row renders the new value.
			await expect(page.getByTestId('success-toast').first()).toBeVisible({
				timeout: 15_000,
			});
			await expect(cell).toHaveText('7', { timeout: 15_000 });

			// Server outcome: the drained push must be accepted. A 403 means this
			// store keeps the signed-in cashier read-only on the catalog — a
			// declared-missing capability, so skip rather than fail.
			const pushResponse = await pushResponsePending;
			if (pushResponse.status() === 403) {
				test.skip(
					true,
					'Store rejects the signed-in cashier catalog push (HTTP 403); grant the E2E cashier product edit capability to enable this spec'
				);
			}
			expect(pushResponse.ok(), `products push failed: HTTP ${pushResponse.status()}`).toBeTruthy();

			// Server truth: quantity applied and stock status flipped to instock.
			await expect
				.poll(
					async () => {
						const record = await fetchProductRecord(request, storeUrl, authorization, probe.id);
						return { qty: Number(record.stock_quantity), status: record.stock_status };
					},
					{ timeout: 30_000 }
				)
				.toEqual({ qty: 7, status: 'instock' });
		} finally {
			await deleteSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: probe.collection,
				id: probe.id,
			});
		}
	});

	test('should rename a product via the edit modal and push the change to the server', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const writerAuthorization = await productWriterAuthorization(request, storeUrl);
		const authorization = writerAuthorization ?? storeAuthorization();
		const created = await createSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'products',
			workerIndex: testInfo.workerIndex,
			writerConfigured: productWriterCredentialsConfigured(),
		});
		if (!created.ok) {
			const hint = writerAuthorization
				? created.reason
				: `${created.reason} (set the E2E_PRODUCT_WRITER_USER/_PASS secrets to enable this spec)`;
			test.skip(true, hint);
			return;
		}
		const rowTestId = created.probe.rowTestId;
		if (!rowTestId) {
			throw new Error('Product edit probe is missing its WC response slug-derived row testID');
		}
		const { probe } = created;
		const newName = `Renamed ${probe.token}`;

		try {
			await navigateToPage(page, 'products');
			const screen = page.getByTestId('screen-products').filter({ visible: true });
			const searchInput = screen.getByTestId('search-products');
			await expect(searchInput).toBeVisible({ timeout: 30_000 });
			await searchAndWaitForServer(page, searchInput, 'products', probe.token);

			const row = screen.getByTestId(rowTestId);
			await expect(row).toBeVisible({ timeout: 30_000 });
			await row.getByTestId('product-actions-button').click();
			const editAction = page.getByTestId('product-actions-edit');
			const editDisabled = await editAction.evaluate(
				(el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
			);
			if (editDisabled) {
				test.skip(
					true,
					'Product edit action is disabled: the signed-in cashier has no catalog write capability on this store'
				);
			}
			await editAction.click();

			const modal = page.getByTestId('product-edit-modal');
			await expect(modal).toBeVisible({ timeout: 15_000 });
			const nameInput = modal.getByTestId('product-edit-name-input');
			await nameInput.clear();
			await nameInput.fill(newName);

			const pushResponsePending = page.waitForResponse(isPushProductsResponse, {
				timeout: 60_000,
			});
			pushResponsePending.catch(() => {});
			await modal.getByTestId('product-edit-save-button').click();

			const pushResponse = await pushResponsePending;
			if (pushResponse.status() === 403) {
				test.skip(
					true,
					'Store rejects the signed-in cashier catalog push (HTTP 403); grant the E2E cashier product edit capability to enable this spec'
				);
			}
			expect(pushResponse.ok(), `products push failed: HTTP ${pushResponse.status()}`).toBeTruthy();

			await expect
				.poll(
					async () => {
						const record = await fetchProductRecord(request, storeUrl, authorization, probe.id);
						return record.name;
					},
					{ timeout: 30_000 }
				)
				.toBe(newName);
		} finally {
			await deleteSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: probe.collection,
				id: probe.id,
			});
		}
	});

	test('modal edit pushes a sparse payload even when the store serves poisoned fields', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const productsRoute = '**/wcpos/v2/products*';
		let poisonedProducts = 0;
		const poisonLowStockAmount = async (route: Route) => {
			try {
				if (route.request().method() !== 'GET') {
					await route.fallback().catch(() => {});
					return;
				}

				const response = await route.fetch();
				// The raw wire body is B9-enveloped ({ data, _wcpos }); poison the
				// inner payload and serve the envelope back, or hydration would
				// discard the mutation before the app ever saw it.
				const wireBody: unknown = await response.json();
				const body = unwrapWireBody(wireBody);
				if (!Array.isArray(body)) {
					await route.fulfill({ response });
					return;
				}

				const poisonedBody = body.map((product) =>
					typeof product === 'object' && product !== null && !Array.isArray(product)
						? { ...(product as Record<string, unknown>), low_stock_amount: '' }
						: product
				);
				poisonedProducts += poisonedBody.length;
				await route.fulfill({
					response,
					body: JSON.stringify(rewrapWireBody(wireBody, poisonedBody)),
				});
			} catch {
				await route.fallback().catch(() => {});
			}
		};
		await page.route(productsRoute, poisonLowStockAmount);

		const { storeUrl, authorization, probe, rowTestId } = await createStockEditProbe(
			request,
			storeAuthorization,
			testInfo
		);
		const newName = `Sparse ${probe.token}`;

		try {
			await navigateToPage(page, 'products');
			const screen = page.getByTestId('screen-products').filter({ visible: true });
			const searchInput = screen.getByTestId('search-products');
			await expect(searchInput).toBeVisible({ timeout: 30_000 });
			await searchAndWaitForServer(page, searchInput, 'products', probe.token);

			const row = screen.getByTestId(rowTestId);
			await expect(row).toBeVisible({ timeout: 30_000 });
			// Silent-green guard: if the interception pattern ever stops matching the
			// catalog GET, the poison premise no-ops and this spec proves nothing.
			expect(
				poisonedProducts,
				'catalog GET was never intercepted — the poisoned-store premise did not apply'
			).toBeGreaterThan(0);
			await row.getByTestId('product-actions-button').click();
			const editAction = page.getByTestId('product-actions-edit');
			const editDisabled = await editAction.evaluate(
				(el) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true'
			);
			if (editDisabled) {
				test.skip(
					true,
					'Product edit action is disabled: the signed-in cashier has no catalog write capability on this store'
				);
			}
			await editAction.click();

			const modal = page.getByTestId('product-edit-modal');
			await expect(modal).toBeVisible({ timeout: 15_000 });
			const nameInput = modal.getByTestId('product-edit-name-input');
			await nameInput.clear();
			await nameInput.fill(newName);

			const pushResponsePending = page.waitForResponse(isPushProductsResponse, {
				timeout: 60_000,
			});
			pushResponsePending.catch(() => {});
			await modal.getByTestId('product-edit-save-button').click();

			const pushResponse = await pushResponsePending;
			if (pushResponse.status() === 403) {
				test.skip(
					true,
					'Store rejects the signed-in cashier catalog push (HTTP 403); grant the E2E cashier product edit capability to enable this spec'
				);
			}
			expect(pushResponse.ok(), `products push failed: HTTP ${pushResponse.status()}`).toBeTruthy();

			const pushRequestBody = pushResponse.request().postDataJSON() as {
				mutationId: unknown;
				operation: unknown;
				collection: unknown;
				recordId: unknown;
				baseRevision: unknown;
				payload: Record<string, unknown>;
			};
			expect(pushRequestBody).toMatchObject({ payload: expect.any(Object) });
			expect(pushRequestBody.payload).not.toHaveProperty('low_stock_amount');
		} finally {
			await page.unroute(productsRoute, poisonLowStockAmount).catch(() => {});
			await deleteSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: probe.collection,
				id: probe.id,
			});
		}
	});

	test('should show red snackbar and auto-revert when the server rejects a stock edit', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const { storeUrl, authorization, probe, rowTestId } = await createStockEditProbe(
			request,
			storeAuthorization,
			testInfo
		);

		// Force the push to be rejected with the same WP error the live 403 carries
		// (#1082). Route handlers must never rethrow — a throw here kills the whole
		// shard (see the guard note in fixtures.ts) — so failures fall back to the
		// network instead.
		const routeMatcher = (url: URL) => isPushProductsUrl(url);
		const fulfillRejection = async (route: Route) => {
			try {
				if (route.request().method() !== 'POST') {
					await route.fallback();
					return;
				}
				await route.fulfill({
					status: 403,
					contentType: 'application/json',
					body: JSON.stringify({
						code: 'woocommerce_rest_cannot_edit',
						message: 'Sorry, you are not allowed to edit this resource.',
						data: { status: 403 },
					}),
				});
			} catch {
				await route.fallback().catch(() => {});
			}
		};

		try {
			await navigateToPage(page, 'products');
			const screen = page.getByTestId('screen-products').filter({ visible: true });
			const searchInput = screen.getByTestId('search-products');
			await expect(searchInput).toBeVisible({ timeout: 30_000 });
			await searchAndWaitForServer(page, searchInput, 'products', probe.token);
			await expect(screen.getByTestId(rowTestId)).toBeVisible({ timeout: 30_000 });

			await page.route(routeMatcher, fulfillRejection);

			const cell = await editStockQuantityViaNumpad(page, rowTestId, '9');

			// The optimistic edit lands first…
			await expect(cell).toHaveText('9', { timeout: 15_000 });

			// …then the rejection surfaces as a red snackbar and the cell auto-reverts
			// to server truth (#1082 ruling: reactive revert).
			await expect(page.getByTestId('toast-SYNC201').first()).toBeVisible({
				timeout: 30_000,
			});
			await expect(cell).toHaveText('0', { timeout: 30_000 });
		} finally {
			await page.unroute(routeMatcher, fulfillRejection).catch(() => {});
			await deleteSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: probe.collection,
				id: probe.id,
			});
		}
	});

	test('should show product actions menu', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.locator('[data-testid="screen-products"]:visible');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		const actionsButton = screen.getByTestId('product-actions-button').first();
		await expect(actionsButton).toBeVisible({ timeout: 15_000 });
		await actionsButton.click();

		await expect(page.getByRole('menuitem').first()).toBeVisible({
			timeout: 15_000,
		});
	});

	test('should expand variable product to show variations', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.locator('[data-testid="screen-products"]:visible');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		await findVariableProduct(page, screen.getByTestId('search-products'));

		// Click the expand link on the variable product
		const expandLink = screen.locator('[data-testid="variable-product-expand"]:visible').first();
		await expect(expandLink).toBeVisible({ timeout: 30_000 });
		await Promise.all([
			page.waitForResponse(
				(response) => isWcposRestRoute(response.url(), '/wcpos/v2/variations') && response.ok(),
				{ timeout: 30_000 }
			),
			expandLink.click(),
		]);

		// Variation rows should now be visible with their actions menus
		const variationActionsMenu = screen.locator('[data-testid="variation-actions-menu"]:visible');
		await expect(variationActionsMenu.first()).toBeVisible({ timeout: 15_000 });
	});

	test('should show variation actions menu with edit/sync/delete', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.locator('[data-testid="screen-products"]:visible');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		await findVariableProduct(page, screen.getByTestId('search-products'));

		const expandLink = screen.locator('[data-testid="variable-product-expand"]:visible').first();
		await expect(expandLink).toBeVisible({ timeout: 30_000 });
		await Promise.all([
			page.waitForResponse(
				(response) => isWcposRestRoute(response.url(), '/wcpos/v2/variations') && response.ok(),
				{ timeout: 30_000 }
			),
			expandLink.click(),
		]);

		// Click the variation actions menu (ellipsis button)
		const variationActionsMenu = screen
			.locator('[data-testid="variation-actions-menu"]:visible')
			.first();
		await expect(variationActionsMenu).toBeVisible({ timeout: 15_000 });
		await variationActionsMenu.click();

		// The dropdown should show menu items (Edit, Sync, Delete)
		await expect(page.getByRole('menuitem').first()).toBeVisible({
			timeout: 15_000,
		});
	});

	test('should collapse expanded variable product on Products page', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		const screen = page.locator('[data-testid="screen-products"]:visible');
		await expect(screen.getByTestId('data-table-count')).toBeVisible({
			timeout: 60_000,
		});

		await findVariableProduct(page, screen.getByTestId('search-products'));

		const expandLink = screen.locator('[data-testid="variable-product-expand"]:visible').first();
		await expect(expandLink).toBeVisible({ timeout: 30_000 });
		await Promise.all([
			page.waitForResponse(
				(response) => isWcposRestRoute(response.url(), '/wcpos/v2/variations') && response.ok(),
				{ timeout: 30_000 }
			),
			expandLink.click(),
		]);

		const variationActionsMenu = screen.locator('[data-testid="variation-actions-menu"]:visible');
		await expect(variationActionsMenu.first()).toBeVisible({ timeout: 15_000 });

		// Collapse
		await expandLink.click();
		await page.waitForTimeout(1_000);

		// Variation actions should no longer be visible
		await expect(variationActionsMenu.first()).not.toBeVisible({
			timeout: 10_000,
		});
	});
});

/**
 * Free users should see the blurred preview overlay when navigating to Products.
 */
test.describe('Products Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade overlay on Products', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({
			timeout: 30_000,
		});
	});

	test('should show View Demo button on upgrade overlay', async ({ posPage: page }) => {
		await navigateToPage(page, 'products');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
