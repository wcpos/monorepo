import { expect, test } from './test';
import { getStoreUrl, getStoreVariant, stubStoreVersionForE2E } from './fixtures';

test.describe('Connect Screen', () => {
	test.beforeEach(async ({ page }, testInfo) => {
		await stubStoreVersionForE2E(page.context(), getStoreUrl(testInfo), getStoreVariant(testInfo));
		await page.goto('/');
		await expect(page.getByTestId('connect-store-button')).toBeVisible({
			timeout: 60_000,
		});
	});

	test('connect form controls and URL enablement', async ({ page }) => {
		await expect(page.getByTestId('store-url-input')).toBeVisible();
		await expect(page.getByTestId('connect-store-button')).toBeVisible();
		await expect(page.getByTestId('enter-demo-store-button')).toBeVisible();

		await expect(page.getByTestId('connect-store-button')).toBeDisabled();

		await page.getByTestId('store-url-input').fill('https://example.com');
		await expect(page.getByTestId('connect-store-button')).toBeEnabled();
	});

	test('should not connect to invalid store URL', async ({ page }) => {
		await page.getByTestId('store-url-input').fill('https://example.com');
		await page.getByTestId('connect-store-button').click();

		await expect(page.getByTestId('logged-in-users-label')).not.toBeVisible({
			timeout: 15_000,
		});
	});

	test('discovers a store at an internationalised (IDN) address', async ({ page }) => {
		test.skip(
			!process.env.E2E_IDN_STORE_URL,
			'No IDN store declared: set E2E_IDN_STORE_URL to a store whose host is non-ASCII'
		);
		const storeUrl = process.env.E2E_IDN_STORE_URL!;
		const urlInput = page.getByTestId('store-url-input');
		await urlInput.click();
		await urlInput.fill(storeUrl);
		await page.waitForTimeout(1_000);

		const connectButton = page.getByTestId('connect-store-button');
		await expect(connectButton).toBeEnabled({ timeout: 10_000 });
		await connectButton.click();

		await expect(page.getByTestId('logged-in-users-label')).toBeVisible({
			timeout: 60_000,
		});

		await expect(page.getByTestId('add-user-button')).toBeVisible();
	});

	test('discover store and show add-user action', async ({ page }, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const urlInput = page.getByTestId('store-url-input');
		await urlInput.click();
		await urlInput.fill(storeUrl);
		await page.waitForTimeout(1_000);

		const connectButton = page.getByTestId('connect-store-button');
		await expect(connectButton).toBeEnabled({ timeout: 10_000 });
		await connectButton.click();

		await expect(page.getByTestId('logged-in-users-label')).toBeVisible({
			timeout: 60_000,
		});

		await expect(page.getByTestId('add-user-button')).toBeVisible();
	});
});

test.describe('Unauthenticated Navigation', () => {
	test('should show connect screen when not logged in', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByTestId('connect-store-button')).toBeVisible({
			timeout: 60_000,
		});
		await expect(page.getByTestId('store-url-input')).toBeVisible();
	});

	test('should handle unknown routes gracefully', async ({ page }) => {
		await page.goto('/some-nonexistent-route');

		await expect(
			page.getByTestId('connect-store-button').or(page.getByTestId('not-found-screen'))
		).toBeVisible({ timeout: 60_000 });
	});
});
