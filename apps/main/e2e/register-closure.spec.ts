import { randomUUID } from 'node:crypto';

import { expect } from '@playwright/test';

import { authenticatedTest, getStoreUrl, hydrateAuthenticatedPage } from './fixtures';

// Stub only the new server contract: no real till or cash ledger is changed by this UI probe.
const test = authenticatedTest.extend({
	posPage: async ({ page }, use, testInfo) => {
		const registerId = randomUUID();
		let session: Record<string, unknown> | null = null;
		let closure: Record<string, unknown> | null = null;
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
						!/\/wcpos\/v2\/(cashier\/|registers|sessions|movements|closures)/.test(path)
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
						expect(response.ok()).toBe(true);
						const body = await response.json();
						body.stores = body.stores.map((store: Record<string, unknown>) => ({
							...store,
							register_sessions: true,
							variance_threshold: '',
							currency: 'GBP',
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
					if (path.includes('/registers/'))
						return route.fulfill({
							headers,
							json: {
								id: registerId,
								counters: {
									last_closure_number: 0,
									perpetual_sales_total: '0',
									perpetual_refunds_total: '0',
								},
							},
						});
					if (path.endsWith('/closures') && request.method() === 'POST') {
						closure = {
							...request.postDataJSON(),
							print_count: 0,
							findings: {},
							expected: { cash: '100' },
							variance: { cash: '0' },
						};
						return route.fulfill({ status: 201, headers, json: closure });
					}
					if (path.endsWith('/movements')) {
						const body = request.postDataJSON();
						movements.push({ ...body, created_at_gmt: body.created_at });
						return route.fulfill({ status: 201, headers, json: movements.at(-1) });
					}
					if (request.method() === 'POST') {
						const body = request.postDataJSON();
						session = path.endsWith('/status')
							? {
									...session,
									...body,
									...(body.status === 'closed' ? { closed_at_gmt: body.at } : {}),
								}
							: { ...body, opened_at_gmt: body.opened_at, opened_by: 0, status: 'open' };
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

test('writes Closure 1 and leaves the last closure in the register panel', async ({
	posPage: page,
}) => {
	await page.getByTestId('open-register-amount').fill('100');
	await page.getByTestId('open-register-button').click();
	await page.getByTestId('register-bar-drawer').click();
	await page.getByTestId('register-panel-close').click();
	await page.getByTestId('count-amount').fill('100');
	await page.getByTestId('count-close').click();
	// The composite title deliberately proves that the minted number is visible offline.
	await expect(page.getByTestId('closure-title')).toContainText('Closure 1');
	await page.getByTestId('closure-done').click();
	await expect(page.getByTestId('closure-sheet')).toHaveCount(0);
	await page.getByTestId('register-bar-drawer').click();
	await expect(page.getByTestId('register-panel-last-closure')).toBeVisible();
	await page.unrouteAll({ behavior: 'ignoreErrors' });
});
