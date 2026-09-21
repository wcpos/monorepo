import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import { authenticatedTest, getStoreUrl, hydrateAuthenticatedPage } from './fixtures';

// Stub only the new server contract: no real till or cash ledger is changed by this UI probe.
const test = authenticatedTest.extend({
	posPage: async ({ page }, use, testInfo) => {
		const registerId = randomUUID();
		let session: Record<string, unknown> | null = null;
		const movements: Record<string, unknown>[] = [];
		await hydrateAuthenticatedPage(page, testInfo, {
			waitForCatalogue: false,
			beforeBoot: async () => {
				await page.route('**/*', async (route) => {
					const request = route.request();
					const url = new URL(request.url());
					const path = url.searchParams.get('rest_route') ?? url.pathname;
					if (
						url.origin !== new URL(getStoreUrl(testInfo)).origin ||
						!/\/wcpos\/v2\/(cashier\/|registers|sessions|movements)/.test(path)
					)
						return route.fallback();
					const headers = {
						'access-control-allow-origin': '*',
						'access-control-allow-methods': 'GET, POST, OPTIONS',
						'access-control-allow-headers':
							request.headers()['access-control-request-headers'] ?? '*',
					};
					if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers });
					if (path.includes('/cashier/')) {
						const response = await route.fetch();
						// A transient non-2xx (token refresh, rate limit) is the app's problem to retry,
						// not a spec failure: pass it through untouched.
						if (!response.ok()) return route.fulfill({ response });
						const body = await response.json();
						body.stores = body.stores.map((store: Record<string, unknown>) => ({
							...store,
							register_sessions: true,
						}));
						return route.fulfill({ response, json: body });
					}
					if (path.endsWith('/registers'))
						return route.fulfill({
							headers,
							json: [
								{ id: registerId, name: 'Session probe', status: 'active', default_float: '100' },
							],
						});
					if (path.endsWith('/movements')) {
						const body = request.postDataJSON();
						movements.push({ ...body, created_at_gmt: body.created_at });
						return route.fulfill({ status: 201, headers, json: movements.at(-1) });
					}
					if (request.method() === 'POST') {
						const body = request.postDataJSON();
						session = { ...body, opened_at_gmt: body.opened_at, opened_by: 0, status: 'open' };
						return route.fulfill({ status: 201, headers, json: session });
					}
					return route.fulfill({
						headers,
						json: path.endsWith('/sessions')
							? session
								? [session]
								: []
							: { ...session, movements, expected: { cash: '100' }, sales_count: 0 },
					});
				});
			},
		});
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture callback
		await use(page);
	},
});

test('opens a register, records paid out, and undoes it', async ({ posPage: page }) => {
	await expect(page.getByTestId('open-register-card')).toBeVisible();
	await page.getByTestId('open-register-amount').fill('100');
	await page.getByTestId('open-register-button').click();
	await expect(page.getByTestId('open-register-card')).toHaveCount(0);
	await page.getByTestId('register-bar-drawer').click();
	await expect(page.getByTestId('register-panel')).toBeVisible();
	await page.getByTestId('register-panel-paid-out').click();
	await page.getByTestId('movement-amount').fill('20');
	await page.getByTestId('movement-reason').fill('Session probe');
	await page.getByTestId('movement-confirm').click();
	await page.getByTestId('register-panel-movements').click();
	await expect(page.getByTestId(/^movement-void-/)).toHaveCount(1);
	// The toast animates while it is on screen and leaves after a few seconds; Playwright's
	// stability wait can outlive it. Click as a cashier would: as soon as it is there.
	await page.getByTestId('toast-undo').click({ force: true, timeout: 5_000 });
	await expect(page.getByTestId(/^movement-void-/)).toHaveCount(0);
	// Routes stay armed after the last assertion; a late fetch would otherwise abort the run.
	await page.unrouteAll({ behavior: 'ignoreErrors' });
});
