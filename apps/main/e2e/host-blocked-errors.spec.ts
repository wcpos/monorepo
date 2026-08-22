import { expect, type Page, type Route, test } from '@playwright/test';

import { stubStoreVersionForE2E } from './fixtures';

const HEADER_NAMES = [
	'authorization',
	'content-type',
	'x-wcpos',
	'x-wcpos-store',
	'idempotency-key',
	'if-match',
	'if-none-match',
	'x-wcpos-idempotency-key',
] as const;

const DEAD_CREDENTIAL_CHANNELS = {
	v: 1,
	headers: Object.fromEntries(HEADER_NAMES.map((name) => [name, { received: false, length: 0 }])),
	params: { authorization: false, wcpos: true, store_id: true },
};

const REPLAYED_ECHO = {
	v: 1,
	headers: Object.fromEntries(
		HEADER_NAMES.map((name) => [
			name,
			name === 'authorization' ? { received: true, length: 24 } : { received: true },
		])
	),
	params: { authorization: true, wcpos: true, store_id: true },
};

const CHALLENGE_HTML =
	'<html><head><title>Just a moment...</title></head><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page"></script></html>';

const isRoute = (url: URL, suffix: string) =>
	url.pathname.includes(`/wcpos/v2/${suffix}`) ||
	(url.searchParams.get('rest_route') ?? '').includes(`/wcpos/v2/${suffix}`);

type StoreFixture = (route: Route, url: URL) => Promise<boolean>;

async function installStoreFixture(
	page: Page,
	storeUrl: string,
	fixture: StoreFixture
): Promise<void> {
	const storeOrigin = new URL(storeUrl).origin;
	await page.context().route('**/*', async (route) => {
		const url = new URL(route.request().url());
		if (url.origin === storeOrigin && (await fixture(route, url))) return;
		await route.continue();
	});

	// Registered second so the discovery-only version stub gets first refusal;
	// its fallback reaches the hostile auth fixture above.
	await stubStoreVersionForE2E(page.context(), storeUrl, 'free');
}

async function connectStore(page: Page, storeUrl: string): Promise<void> {
	await page.goto('/');
	await expect(page.getByTestId('connect-store-button')).toBeVisible({
		timeout: 60_000,
	});

	const urlInput = page.getByTestId('store-url-input');
	await urlInput.click();
	await urlInput.fill(storeUrl);
	await page.waitForTimeout(1_000);

	const connectButton = page.getByTestId('connect-store-button');
	await expect(connectButton).toBeEnabled({ timeout: 10_000 });
	await connectButton.click();
}

async function expectBlockingError(page: Page, code: string): Promise<void> {
	const docsLink = page.getByTestId('connect-error-docs-link');
	await expect(docsLink).toBeVisible({ timeout: 60_000 });
	await expect(docsLink).toHaveAttribute('href', new RegExp(`/error-codes/${code}$`));
	// The translated Text has no testID. Anchor its structural assertion to the
	// coded docs-link testID rather than selecting localized copy.
	await expect(docsLink.locator('xpath=preceding-sibling::*[1]')).toBeVisible();
	await expect(page.getByTestId('logged-in-users-label')).not.toBeVisible();
}

test('AUTH431 names REST transport blocked when both auth routes are absent', async ({
	page,
}, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, async (route, url) => {
		if (!isRoute(url, 'echo') && !isRoute(url, 'auth/test')) return false;
		await route.fulfill({
			status: 404,
			contentType: 'text/plain',
			body: 'blocked by E2E',
		});
		return true;
	});
	await connectStore(page, storeUrl!);

	await expectBlockingError(page, 'AUTH431');
});

test('AUTH421 names hosts that strip every credential channel', async ({ page }, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, async (route, url) => {
		if (!isRoute(url, 'echo')) return false;
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(DEAD_CREDENTIAL_CHANNELS),
		});
		return true;
	});
	await connectStore(page, storeUrl!);

	await expectBlockingError(page, 'AUTH421');
});

test('HOST121 names bot challenges blocking the API', async ({ page }, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, async (route, url) => {
		if (!isRoute(url, 'echo') && !isRoute(url, 'auth/test')) return false;
		await route.fulfill({
			status: 403,
			contentType: 'text/html',
			body: CHALLENGE_HTML,
		});
		return true;
	});
	await connectStore(page, storeUrl!);

	await expectBlockingError(page, 'HOST121');
});

test('HOST151 blocks an authenticated echo replayed from shared cache', async ({
	page,
}, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, async (route, url) => {
		const request = route.request();
		const isReplayProbe =
			request.method() === 'GET' &&
			isRoute(url, 'echo') &&
			Boolean(request.headers()['authorization']) &&
			!url.searchParams.has('authorization');
		if (!isReplayProbe) return false;
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(REPLAYED_ECHO),
		});
		return true;
	});
	await connectStore(page, storeUrl!);

	await expectBlockingError(page, 'HOST151');
});

test('HOST141 warns when search-like ping requests are blocked without blocking connect', async ({
	page,
}, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, async (route, url) => {
		if (!isRoute(url, 'ping') || !url.searchParams.has('s')) return false;
		await route.fulfill({
			status: 403,
			contentType: 'text/plain',
			body: 'blocked by E2E',
		});
		return true;
	});
	await connectStore(page, storeUrl!);

	await Promise.all([
		expect(page.getByTestId('logged-in-users-label')).toBeVisible({
			timeout: 60_000,
		}),
		expect(page.getByTestId('toast-HOST141')).toBeVisible({ timeout: 60_000 }),
	]);
});
