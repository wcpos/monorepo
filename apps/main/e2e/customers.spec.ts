import { expect, type Page } from '@playwright/test';

import { LOADED_COUNT_TEST_ID } from './catalogue-readiness';
import {
	getStoreUrl,
	getStoreVariant,
	navigateToPage,
	authenticatedTest as test,
} from './fixtures';
import { resolveProbeAuthorization } from './probe-credential';
import {
	createSearchProbe,
	deleteSearchProbe,
	mintSearchProbeToken,
	searchAndWaitForServer,
} from './search-probe';

async function openAddCartItemsMenu(page: Page) {
	const menuButton = page.getByTestId('add-cart-item-menu');
	await expect(menuButton).toBeVisible({ timeout: 15_000 });
	await menuButton.click();
}

/**
 * Customer-related tests in the POS context (both free and pro).
 */
test.describe('Customers in POS', () => {
	test('opens the customer picker from the name and the address editor from the pin', async ({
		posPage: page,
	}) => {
		const customerPill = page.getByTestId('cart-customer-name');
		await expect(customerPill).toBeVisible({ timeout: 15_000 });
		// The chip is a dropdown: a tap swaps in the picker (its trigger replaces the chip).
		await customerPill.click();
		await expect(page.getByTestId('cart-customer-select')).toBeVisible({ timeout: 15_000 });
		await page.keyboard.press('Escape');

		// The address editor is the split chip's pin cell (owner, 2026-10-22).
		await expect(customerPill).toBeVisible({ timeout: 15_000 });
		await page.getByTestId('cart-customer-address').click();
		await expect(page.getByTestId('customer-address-dialog')).toBeVisible({ timeout: 15_000 });
	});
});

/**
 * Pro: create a new customer from the POS cart.
 */
test.describe('Add Customer from Cart (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Adding customers from cart requires Pro');
	});

	/**
	 * The one test in this file that actually SUBMITS. The other dialog tests stop
	 * at "the dialog opened", which is why a create that died in the storage layer
	 * shipped unnoticed: `use-mutation` sourced its payload from
	 * `RxDocument.get('payload')`, an RxDB **Proxy**, and on web the storage lives
	 * in a Worker — so the enqueue failed the structured clone with
	 * "#<Object> could not be cloned" on every attempt, online or offline.
	 *
	 * Store-agnostic: the customer is minted here with a probe token and asserted
	 * on by that token, never against anything the store is assumed to hold. The
	 * record is left behind by design (unique per run, invisible to later runs);
	 * cleanup would need customer-delete credentials this spec does not claim.
	 */
	test('should create a customer from the cart and attach it to the order', async ({
		posPage: page,
	}, testInfo) => {
		const probe = mintSearchProbeToken(testInfo.workerIndex);

		await openAddCartItemsMenu(page);
		const addCustomerMenuItem = page.getByTestId('menu-add-customer');
		await expect(addCustomerMenuItem).toBeEnabled({ timeout: 10_000 });
		await addCustomerMenuItem.click();

		const dialog = page.getByTestId('add-customer-dialog');
		await expect(dialog).toBeVisible({ timeout: 10_000 });

		await dialog.getByTestId('customer-first-name-input').fill(probe);
		await dialog.getByTestId('customer-last-name-input').fill('Probe');
		await dialog.getByTestId('customer-email-input').fill(`${probe}@example.com`);
		await dialog.getByTestId('customer-form-add').click();

		// The cart attaches the customer from its local record without waiting
		// for the Woo id (#1523), so the dialog closing is the enqueue and the
		// attach having succeeded. A create that could not be queued leaves it open.
		// The server round trip is covered by pos-offline-new-customer.spec.ts.
		await expect(dialog).toBeHidden({ timeout: 30_000 });

		// Read the pill addressed by testID; the probe token is the referent, not
		// the surrounding formatted name.
		await expect(page.getByTestId('cart-customer-name')).toContainText(probe, {
			timeout: 15_000,
		});
	});

	test('should show customer form fields in dialog', async ({ posPage: page }) => {
		await openAddCartItemsMenu(page);
		const addCustomerMenuItem = page.getByTestId('menu-add-customer');
		await expect(addCustomerMenuItem).toBeVisible({ timeout: 10_000 });
		await expect(addCustomerMenuItem).toBeEnabled();
		await addCustomerMenuItem.click();
		await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

		// Form should contain input fields for customer details
		const inputs = page.getByRole('dialog').locator('input');
		expect(await inputs.count()).toBeGreaterThanOrEqual(1);
	});
});

/**
 * Free: add customer button should be disabled.
 */
test.describe('Add Customer from Cart (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Only for free stores');
	});

	test('should show add-customer menu item disabled for free users', async ({ posPage: page }) => {
		await openAddCartItemsMenu(page);
		const addCustomerMenuItem = page.getByTestId('menu-add-customer');
		await expect(addCustomerMenuItem).toBeVisible({ timeout: 10_000 });
		await expect(addCustomerMenuItem).toBeDisabled();
	});
});

/**
 * Customers page (pro-only drawer page).
 */
test.describe('Customers Page (Pro)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'pro', 'Customers page requires Pro');
	});

	test('Customers page initial state', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		const screen = page.getByTestId('screen-customers');
		await expect(screen.getByTestId('search-customers')).toBeVisible({ timeout: 30_000 });

		await expect
			.poll(
				async () => {
					const hasCustomers = await screen
						.getByTestId('data-table-count')
						.isVisible()
						.catch(() => false);
					const noCustomers = await screen
						.getByTestId('no-data-message')
						.isVisible()
						.catch(() => false);
					return hasCustomers || noCustomers;
				},
				{ timeout: 30_000 }
			)
			.toBeTruthy();

		await expect(screen.getByTestId('customers-add-button')).toBeVisible();
	});

	test('should search customers', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		// Resolved, never taken on trust: `storeAuthorization()` is the last credential
		// the app was seen SENDING, which on a restored session is routinely an expired
		// token — every probe then 401s and reads as a broken store.
		const authorization = await resolveProbeAuthorization(request, storeUrl, storeAuthorization);
		const created = await createSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'customers',
			workerIndex: testInfo.workerIndex,
		});
		if (!created.ok) {
			test.skip(true, created.reason);
			return;
		}

		try {
			await navigateToPage(page, 'customers');
			const screen = page.getByTestId('screen-customers');
			const searchInput = screen.getByTestId('search-customers');
			await expect(searchInput).toBeVisible({ timeout: 30_000 });

			await searchAndWaitForServer(page, searchInput, 'customers', created.probe.token);

			const matchingRows = screen.getByTestId(/^data-table-row-/);
			await expect(matchingRows).toHaveCount(1, { timeout: 30_000 });
			await expect(matchingRows.first()).toBeVisible();
			// The RENDERED count, not the footer sentence — /\b1\b/ on
			// "Showing {shown} of {total}" also matches the server total (#1345).
			await expect(screen.getByTestId(LOADED_COUNT_TEST_ID)).toHaveText('1');
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
});

/**
 * Free users should see the blurred preview overlay when navigating to Customers.
 */
test.describe('Customers Page (Free)', () => {
	test.beforeEach(async ({}, testInfo) => {
		const variant = getStoreVariant(testInfo);
		test.skip(variant !== 'free', 'Upgrade page only shows for free stores');
	});

	test('should show View Demo button on upgrade overlay', async ({ posPage: page }) => {
		await navigateToPage(page, 'customers');
		await expect(page.getByTestId('upgrade-title')).toBeVisible({ timeout: 30_000 });
		await expect(page.getByTestId('view-demo-button')).toBeVisible();
	});
});
