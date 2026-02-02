import { test as base, expect, type Page } from '@playwright/test';

export const STORE_URL = process.env.E2E_STORE_URL || 'https://dev-free.wcpos.com';
const E2E_USERNAME = process.env.E2E_USERNAME || 'demo';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'demo';

/**
 * Authenticate the current page with the test store via OAuth.
 *
 * expo-auth-session opens a popup for OAuth and uses postMessage to
 * receive the callback URL. In Playwright, popups are blocked, so we:
 * 1. Intercept window.open to capture the auth URL
 * 2. Open it in a separate page and complete login
 * 3. Capture the callback redirect URL
 * 4. Send a postMessage to the main page to simulate the popup's callback
 */
export async function authenticateWithStore(page: Page) {
	const context = page.context();

	// Intercept window.open: capture the URL, return fake window to prevent
	// expo-auth-session from falling back to a page redirect.
	await page.addInitScript(() => {
		(window as any).__capturedAuthUrl = null;
		const origOpen = window.open;
		window.open = (url?: string | URL, ...args: any[]) => {
			if (url && url.toString().includes('wcpos')) {
				(window as any).__capturedAuthUrl = url.toString();
				return { closed: false, close: () => {}, location: { href: '' } } as any;
			}
			return origOpen.call(window, url, ...args);
		};
	});

	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Enter Demo Store' })).toBeVisible({
		timeout: 60_000,
	});

	// Type the store URL and connect
	const urlInput = page.getByRole('textbox', { name: /Enter the URL/i });
	await urlInput.click();
	await urlInput.fill(STORE_URL);
	await page.waitForTimeout(1_000);

	const connectButton = page.getByRole('button', { name: 'Connect' });
	await expect(connectButton).toBeEnabled({ timeout: 10_000 });
	await connectButton.click();

	// Wait for the store to be discovered
	await expect(page.getByText('Logged in users:')).toBeVisible({ timeout: 60_000 });

	// Click the + button to trigger OAuth
	const addUserButton = page.getByTestId('add-user-button');
	await addUserButton.click();

	// Wait for the auth URL to be captured
	let authUrl: string | null = null;
	for (let i = 0; i < 30; i++) {
		authUrl = await page.evaluate(() => (window as any).__capturedAuthUrl);
		if (authUrl) break;
		await page.waitForTimeout(1_000);
	}

	if (!authUrl) {
		throw new Error('Failed to capture OAuth URL from window.open');
	}

	// Get the localStorage handle for postMessage verification
	const handle = await page.evaluate(() =>
		window.localStorage.getItem('ExpoWebBrowserRedirectHandle')
	);

	// Open the auth URL in a new page and complete login
	const loginPage = await context.newPage();
	await loginPage.goto(authUrl);
	await loginPage.waitForLoadState('networkidle');

	// Fill in credentials
	const usernameInput = loginPage.locator('#user_login, #wcpos-user-login');
	const passwordInput = loginPage.locator('#user_pass, #wcpos-user-pass');

	if (await usernameInput.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
		await usernameInput.first().fill(E2E_USERNAME);
	}
	if (await passwordInput.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
		await passwordInput.first().fill(E2E_PASSWORD);
	}

	// Submit login form
	const logInButton = loginPage.locator(
		'#wp-submit, #wcpos-submit, button:has-text("Log In"), input[value="Log In"]'
	);
	await expect(logInButton.first()).toBeVisible({ timeout: 15_000 });
	await logInButton.first().click();

	// After login, the page redirects back to localhost with auth tokens
	await loginPage.waitForURL(
		(url) => url.hostname === 'localhost' || url.hostname === '127.0.0.1',
		{ timeout: 60_000 }
	);

	const callbackUrl = loginPage.url();
	await loginPage.close();

	// Simulate the postMessage that the popup would normally send
	await page.evaluate(
		({ url, handle }) => {
			window.postMessage({ url, expoSender: handle }, window.location.origin);
		},
		{ url: callbackUrl, handle }
	);

	// Wait for the app to process the auth result
	await page.waitForTimeout(5_000);

	// Wait for POS screen - the app may auto-navigate after auth,
	// or we may need to select user/store on the connect screen.
	const searchProducts = page.getByPlaceholder('Search Products');

	for (let attempt = 0; attempt < 3; attempt++) {
		if (await searchProducts.isVisible({ timeout: 10_000 }).catch(() => false)) {
			break;
		}

		// Try clicking user button if visible
		const userButton = page
			.getByRole('button')
			.filter({ hasNotText: /Connect|Enter Demo Store|Clear text/ })
			.filter({ hasText: /^[A-Z][a-z]+/ })
			.first();
		if (await userButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await userButton.click().catch(() => {});
			await page.waitForTimeout(2_000);
		}

		// Try clicking store button if visible
		const storeButton = page.getByRole('button').filter({ hasText: /Store/ }).first();
		if (await storeButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
			await storeButton.click().catch(() => {});
			await page.waitForTimeout(2_000);
		}
	}

	await expect(searchProducts).toBeVisible({ timeout: 60_000 });

	// Wait for products to sync
	await expect(page.getByText(/Showing [1-9]\d* of \d+/)).toBeVisible({ timeout: 120_000 });
}

/**
 * Extended test fixture that provides an authenticated POS page.
 * Use `authenticatedTest` instead of `test` for tests that need a logged-in session.
 */
export const authenticatedTest = base.extend<{ posPage: Page }>({
	posPage: async ({ page }, use) => {
		await authenticateWithStore(page);
		await use(page);
	},
});
