import { expect, type Page } from '@playwright/test';

import { isolatedProductTest as test, tryAddRunPrivateSimpleProduct } from './checkout-probe';
import { getStoreVariant, navigateToPage, tryAddProductBySku } from './fixtures';
import { extractOrderIdFromPushBody, extractOrderNumberFromPushBody } from './order-cleanup';
import { stampRunLabel } from './order-lifecycle';
import { mintSearchProbeToken, searchAndWaitForServer } from './search-probe';

/**
 * Layer 2 status: order queries are already cashier/store-relative (#1071), but
 * the client cannot mint a disjoint scope. The checked-in wc/v3 REST index's
 * customer POST has no role field, and StoreSelect can only choose stores the
 * cashier endpoint already assigned. Full isolation therefore needs server-side
 * provisioning of e2e-cashier-1..8 as POS-capable cashiers on the target store;
 * the orchestrator can select one username/password pair by shard/run slot via
 * the existing E2E_USERNAME/E2E_PASSWORD login parameters. The slot key must
 * include the RUN id as well as the shard index because push- and PR-event runs
 * can overlap across separate concurrency groups.
 */

/** Helper to navigate to Orders page and wait for load */
async function navigateToOrders(page: Page) {
	await navigateToPage(page, 'orders');
	const screen = page.getByTestId('screen-orders');
	await expect(screen.getByTestId('search-orders')).toBeVisible({ timeout: 30_000 });
	return screen;
}

/** Add a resident simple product so Save creates an order with the active POS scope meta. */
async function addOrderProbeProduct(page: Page) {
	if (await tryAddRunPrivateSimpleProduct(page)) return;

	// Secretless forks retain the pre-isolation shared-SKU path below.
	const skuResult = await tryAddProductBySku(page);
	if (skuResult === 'added') return;
	if (skuResult === 'add_failed') {
		throw new Error('Dedicated E2E SKU matched but did not reach the order-probe cart');
	}

	const tile = page.getByTestId('product-tile').first();
	const tableButton = page.getByTestId('add-to-cart-button').first();
	await expect(tile.or(tableButton).first()).toBeVisible({ timeout: 30_000 });
	if (await tile.isVisible()) {
		await tile.click();
	} else {
		await tableButton.click();
	}
	await expect(page.getByTestId('checkout-button')).toBeVisible({ timeout: 15_000 });
}

/**
 * Orders page (pro-only).
 */
test.describe('Orders Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Orders page requires Pro');
	});

	test('should navigate to Orders page and see order list', async ({ posPage: page }) => {
		await navigateToOrders(page);
	});

	test('should show order columns', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		// Wait for orders data to load first
		await expect(
			screen.getByTestId('data-table-count').or(screen.getByTestId('no-data-message')).first()
		).toBeVisible({ timeout: 30_000 });

		// Check that column headers are present (at least 2 expected)
		const columnHeaders = screen.getByRole('columnheader');
		await expect(columnHeaders.first()).toBeVisible({ timeout: 15_000 });
		expect(await columnHeaders.count()).toBeGreaterThanOrEqual(2);
	});

	test('should show orders or empty state', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		// Poll so the assertion waits for whichever state resolves. A bare
		// `isVisible({ timeout })` samples once and ignores its timeout, so both
		// reads could be false while the table is still loading (#1044).
		await expect
			.poll(
				async () => {
					const hasOrders = await screen
						.getByTestId('data-table-count')
						.isVisible()
						.catch(() => false);
					const noOrders = await screen
						.getByTestId('no-data-message')
						.isVisible()
						.catch(() => false);
					return hasOrders || noOrders;
				},
				{ timeout: 30_000 }
			)
			.toBeTruthy();
	});

	test('should search orders', async ({ posPage: page }, testInfo) => {
		await addOrderProbeProduct(page);
		await stampRunLabel(page, `E2E Probe ${mintSearchProbeToken(testInfo.workerIndex)}`);

		const savePending = page.waitForResponse(
			(response) => {
				if (response.request().method() !== 'POST') return false;
				// Pretty permalinks put the route in the pathname; plain permalinks
				// carry it as ?rest_route= — match both, like searchAndWaitForServer.
				const url = new URL(response.url());
				return (
					url.pathname.endsWith('/wp-json/wcpos/v2/push/orders') ||
					url.searchParams.get('rest_route') === '/wcpos/v2/push/orders'
				);
			},
			{ timeout: 90_000 }
		);
		savePending.catch(() => {});
		await page.getByTestId('save-to-server-button').click();
		const saveResponse = await savePending;
		if (!saveResponse.ok()) {
			test.skip(
				true,
				`Store rejected order search-probe creation (HTTP ${saveResponse.status()}); server write access is required`
			);
			return;
		}

		const pushBody: unknown = await saveResponse.json().catch(() => null);
		const orderId = extractOrderIdFromPushBody(pushBody);
		const envelope = (saveResponse.request().postDataJSON() ?? {}) as { recordId?: unknown };
		const orderUuid = typeof envelope.recordId === 'string' ? envelope.recordId : '';
		if (orderId === null || !orderUuid) {
			throw new Error('Order search-probe create succeeded without its server id or stable uuid');
		}
		await expect(page.getByTestId('save-to-server-button')).toBeEnabled({ timeout: 30_000 });

		const screen = await navigateToOrders(page);
		const searchInput = screen.getByTestId('search-orders');
		// The Orders table renders `number`, which differs from the server `id` on
		// stores running sequential-order-number plugins — search and assert by the
		// DISPLAYED number, falling back to the id when the push body omits it.
		const orderNumber = extractOrderNumberFromPushBody(pushBody) ?? String(orderId);
		await searchAndWaitForServer(page, searchInput, 'orders', orderNumber);

		const createdRow = screen.getByTestId(`data-table-row-${orderUuid}`);
		await expect(createdRow).toBeVisible({ timeout: 30_000 });
		await expect(createdRow).toContainText(orderNumber);
		await expect
			.poll(() => screen.getByTestId(/^data-table-row-/).count(), { timeout: 30_000 })
			.toBeGreaterThanOrEqual(1);
	});

	test('should show filter pills', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		await expect(screen.getByTestId('order-filter-status')).toBeVisible({ timeout: 15_000 });
	});

	test('should show order actions menu', async ({ posPage: page }) => {
		const screen = await navigateToOrders(page);

		const actionsButton = screen.getByTestId('order-actions-button').first();
		await expect(actionsButton).toBeVisible({ timeout: 15_000 });
		await actionsButton.click();

		await expect(page.getByTestId('order-delete-menu-item')).toBeVisible({ timeout: 15_000 });
	});
});

/**
 * Free users should see the blurred preview overlay when navigating to Orders.
 */
test.describe('Orders Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show upgrade overlay on Orders', async ({ posPage: page }) => {
		await navigateToPage(page, 'orders');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
	});

	test('should show View Demo button on upgrade overlay', async ({ posPage: page }) => {
		await navigateToPage(page, 'orders');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
