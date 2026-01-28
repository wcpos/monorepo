import type { Page } from '@playwright/test';

/**
 * Test helper for authentication flows
 */

export interface TestStore {
	url: string;
	username: string;
	password: string;
}

/**
 * Default test store configuration
 * In CI, this would be overridden by environment variables
 */
export const defaultTestStore: TestStore = {
	url: process.env.TEST_STORE_URL || 'https://demo.wcpos.com',
	username: process.env.TEST_STORE_USERNAME || 'demo',
	password: process.env.TEST_STORE_PASSWORD || 'demo',
};

/**
 * Connect to a WooCommerce store
 */
export async function connectToStore(page: Page, store: TestStore = defaultTestStore) {
	// Navigate to the auth page
	await page.goto('/');

	// Wait for the URL input to be visible
	await page.waitForSelector('[data-testid="store-url-input"], input[placeholder*="URL"]', {
		timeout: 30000,
	});

	// Enter store URL
	const urlInput = page.locator('[data-testid="store-url-input"], input[placeholder*="URL"]');
	await urlInput.fill(store.url);

	// Click connect button
	const connectButton = page.locator('[data-testid="connect-button"], button:has-text("Connect")');
	await connectButton.click();

	// Wait for authentication to complete or for the login form
	await page.waitForSelector(
		'[data-testid="username-input"], input[placeholder*="Username"], [data-testid="pos-screen"]',
		{
			timeout: 30000,
		}
	);

	// If we see a username input, we need to log in
	const usernameInput = page.locator(
		'[data-testid="username-input"], input[placeholder*="Username"]'
	);
	if (await usernameInput.isVisible()) {
		await usernameInput.fill(store.username);

		const passwordInput = page.locator(
			'[data-testid="password-input"], input[placeholder*="Password"]'
		);
		await passwordInput.fill(store.password);

		const loginButton = page.locator('[data-testid="login-button"], button:has-text("Login")');
		await loginButton.click();
	}

	// Wait for the main app to load
	await page.waitForSelector('[data-testid="pos-screen"], [data-testid="drawer-menu"]', {
		timeout: 60000,
	});
}

/**
 * Check if the user is authenticated (on the main app screen)
 */
export async function isAuthenticated(page: Page): Promise<boolean> {
	try {
		await page.waitForSelector('[data-testid="pos-screen"], [data-testid="drawer-menu"]', {
			timeout: 5000,
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Logout from the app
 */
export async function logout(page: Page) {
	// Open user menu
	const userMenu = page.locator('[data-testid="user-menu"], [aria-label="User menu"]');
	await userMenu.click();

	// Click logout
	const logoutButton = page.locator(
		'[data-testid="logout-button"], button:has-text("Logout"), button:has-text("Disconnect")'
	);
	await logoutButton.click();

	// Wait for auth screen
	await page.waitForSelector('[data-testid="store-url-input"], input[placeholder*="URL"]', {
		timeout: 10000,
	});
}
