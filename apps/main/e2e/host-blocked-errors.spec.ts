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

/**
 * A fixture is a matcher plus a response, so a preflight can be answered by
 * whoever answers the real request.
 *
 * The app and the store are different origins in every E2E lane, and the app
 * sends custom headers (X-WCPOS, Authorization), so each probe is preflighted.
 * A fulfilled response without CORS headers is rejected by the browser as a
 * network error, which silently rewrites the condition under test: a mocked
 * echo body meant to prove AUTH421 becomes "network dead everywhere" and the
 * ladder answers AUTH431 instead. That mismatch showed up as flakiness before
 * these headers existed.
 */
interface StoreFixture {
	matches: (url: URL, request: Request) => boolean;
	response: { status: number; contentType: string; body: string };
}

type Request = ReturnType<Route['request']>;

const CORS_HEADERS: Record<string, string> = {
	'access-control-allow-origin': '*',
	'access-control-allow-methods': 'GET,POST,OPTIONS',
	'access-control-allow-headers': '*',
	'access-control-max-age': '600',
};

async function installStoreFixture(
	page: Page,
	storeUrl: string,
	fixture: StoreFixture
): Promise<void> {
	const storeOrigin = new URL(storeUrl).origin;
	await page.context().route('**/*', async (route) => {
		try {
			const request = route.request();
			const url = new URL(request.url());
			if (url.origin !== storeOrigin || !fixture.matches(url, request)) {
				await route.continue();
				return;
			}
			if (request.method() === 'OPTIONS') {
				await route.fulfill({ status: 204, headers: CORS_HEADERS, body: '' });
				return;
			}
			await route.fulfill({ ...fixture.response, headers: CORS_HEADERS });
		} catch (error) {
			// The context can close mid-flight at teardown; a rejected handler
			// surfaces as a spurious test error rather than a real failure.
			if (!/closed|Target page|context or browser/i.test(String(error))) throw error;
		}
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
	// The code rides the testID: DocsLink renders as a role="link" div (RNW
	// Pressable), so there is no href attribute in the DOM to read, and the
	// message copy is translated. The code-bearing testID is the referent.
	await expect(page.getByTestId(`connect-error-docs-link-${code}`)).toBeVisible({
		timeout: 60_000,
	});
	await expect(page.getByTestId('connect-error-message')).toBeVisible();
	await expect(page.getByTestId('logged-in-users-label')).not.toBeVisible();
}

test('AUTH431 names REST transport blocked when both auth routes are absent', async ({
	page,
}, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, {
		matches: (url) => isRoute(url, 'echo') || isRoute(url, 'auth/test'),
		response: { status: 404, contentType: 'text/plain', body: 'blocked by E2E' },
	});
	await connectStore(page, storeUrl!);

	await expectBlockingError(page, 'AUTH431');
});

test('AUTH421 names hosts that strip every credential channel', async ({ page }, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, {
		matches: (url) => isRoute(url, 'echo'),
		response: {
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(DEAD_CREDENTIAL_CHANNELS),
		},
	});
	await connectStore(page, storeUrl!);

	await expectBlockingError(page, 'AUTH421');
});

test('HOST121 names bot challenges blocking the API', async ({ page }, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, {
		matches: (url) => isRoute(url, 'echo') || isRoute(url, 'auth/test'),
		response: { status: 403, contentType: 'text/html', body: CHALLENGE_HTML },
	});
	await connectStore(page, storeUrl!);

	await expectBlockingError(page, 'HOST121');
});

test('HOST151 blocks an authenticated echo replayed from shared cache', async ({
	page,
}, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, {
		// The replay probes are the echo GETs that carry an Authorization header
		// but NO authorization query param — the ladder's own echo carries the
		// masked param, so it still reaches the real store.
		matches: (url, request) =>
			(request.method() === 'GET' || request.method() === 'OPTIONS') &&
			isRoute(url, 'echo') &&
			!url.searchParams.has('authorization'),
		response: {
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(REPLAYED_ECHO),
		},
	});
	await connectStore(page, storeUrl!);

	await expectBlockingError(page, 'HOST151');
});

test('HOST141 warns when search-like ping requests are blocked without blocking connect', async ({
	page,
}, testInfo) => {
	const storeUrl = (testInfo.project.use as { storeUrl?: string }).storeUrl;
	test.skip(!storeUrl, 'E2E_STORE_URL_FREE is not configured');

	await installStoreFixture(page, storeUrl!, {
		matches: (url) => isRoute(url, 'ping') && url.searchParams.has('s'),
		response: { status: 403, contentType: 'text/plain', body: 'blocked by E2E' },
	});
	await connectStore(page, storeUrl!);

	await Promise.all([
		expect(page.getByTestId('logged-in-users-label')).toBeVisible({
			timeout: 60_000,
		}),
		expect(page.getByTestId('toast-HOST141')).toBeVisible({ timeout: 60_000 }),
	]);
});
