import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, type Page } from '@playwright/test';

import en from '../../../packages/core/src/contexts/translations/locales/en/core.json';
import serverDocument from '../../../packages/core/src/services/register-session/__fixtures__/closure.json';
import {
	authenticatedTest,
	getStoreUrl,
	hydrateAuthenticatedPage,
	wcposRestRoute,
} from './fixtures';

import type { Correction } from '../../../packages/core/src/services/register-session/settled-figures';

// Last month's middle days always fit one preset, including runs on the first of a month.
const now = new Date();
const businessDays = [10, 11].map((day) =>
	new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day)).toISOString().slice(0, 10)
);
// Both required layouts run the same financial walk; all writes below stay inside the stub.
const viewports = [
	{ name: 'tablet', width: 1024, height: 768 },
	{ name: 'phone', width: 390, height: 844 },
];
const correctionId = 1;
const recountReason = 'Reports probe recount';
const templateId = 'closure-probe-default';
// Preserve the shipped layout; markers wrap existing values only. Print count is nonvisual.
const templateContent = readFileSync(
	join(
		__dirname,
		'../../../packages/core/src/services/register-session/__fixtures__/closure-default.html'
	),
	'utf8'
)
	.replace('{{i18n.copy}}', '<span data-testid="probe-copy">{{i18n.copy}}</span>')
	.replace(/{{#closure.tenders}}[\s\S]*?{{\/closure.tenders}}/, (tenders) =>
		tenders.replace(
			'{{counted_display}}',
			'<span data-testid="probe-recorded-{{name}}">{{counted_display}}</span>'
		)
	)
	.replace(
		'</article>',
		'<span hidden data-testid="probe-print-count">{{closure.print_count}}</span></article>'
	);

type Probe = {
	ids: string[];
	closureRequests: string[];
	printRequests: string[];
	receiptIntents: string[];
	recounts: { id: string; counted: Record<string, string>; reason: string }[];
	printed: { copy: string | null; count: string | null; recorded: string | null }[];
	unexpectedWrites: string[];
};
const test = authenticatedTest.extend<{ freeLicense: boolean; probe: Probe }>({
	freeLicense: [false, { option: true }],
	// eslint-disable-next-line no-empty-pattern -- Playwright fixtures require a destructured first argument.
	probe: async ({}, use) => {
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture callback
		await use({
			ids: [randomUUID(), randomUUID()],
			closureRequests: [],
			printRequests: [],
			receiptIntents: [],
			recounts: [],
			printed: [],
			unexpectedWrites: [],
		});
	},
	posPage: async ({ page, freeLicense, probe }, use, testInfo) => {
		const registerId = randomUUID();
		const corrections: Correction[] = [
			{
				id: correctionId,
				type: 'recount',
				actor: { id: 1, name: 'Probe cashier' },
				approver: null,
				reason: 'Original probe recount',
				created_at: `${businessDays[1]}T18:00:00Z`,
				figures: { counted: { cash: '180.0000' }, variance: { cash: '0.0000' } },
			},
		];
		const rows = probe.ids.map((id, index) => ({
			...serverDocument.closure,
			id,
			register_id: registerId,
			session_id: randomUUID(),
			number: index + 1,
			business_day: businessDays[index],
			opened_at_gmt: `${businessDays[index]} 08:00:00`,
			closed_at_gmt: `${businessDays[index]} 17:00:00`,
			opened_at: {
				...serverDocument.closure.opened_at,
				datetime: `${businessDays[index]} 08:00 UTC`,
			},
			closed_at: {
				...serverDocument.closure.closed_at,
				datetime: `${businessDays[index]} 17:00 UTC`,
			},
			corrections_count: index,
			print_count: 1,
		}));
		await page.exposeBinding(
			'captureClosurePrint',
			(_source, printed: Probe['printed'][number]) => {
				probe.printed.push(printed);
			}
		);
		await hydrateAuthenticatedPage(page, testInfo, {
			// Never restore a saved Pro license (or printer profile) into the Free case.
			// This unique, unsaved state name selects the existing cold OAuth path.
			stateName: `reports-closures-${randomUUID()}`,
			waitForCatalogue: false,
			beforeBoot: async () => {
				await page.addInitScript(() => {
					window.print = () => {
						// exposeBinding adds this test-only function to every frame.
						const capture = window as unknown as Window & {
							captureClosurePrint: (value: {
								copy: string | null;
								count: string | null;
								recorded: string | null;
							}) => Promise<void>;
						};
						void capture.captureClosurePrint({
							copy: document.querySelector('[data-testid="probe-copy"]')?.textContent ?? null,
							count:
								document.querySelector('[data-testid="probe-print-count"]')?.textContent ?? null,
							recorded:
								document.querySelector('[data-testid="probe-recorded-cash"]')?.textContent ?? null,
						});
						window.dispatchEvent(new Event('afterprint'));
					};
				});
				await page.route('**/*', async (route) => {
					const request = route.request();
					const url = new URL(request.url());
					if (url.origin !== new URL(getStoreUrl(testInfo)).origin) return route.fallback();
					const path = wcposRestRoute(request.url());
					// Discovery is deliberately overridden at page level, before the fixture's
					// context-level Pro mask. Preserve actual plugin compatibility information.
					if (
						request.method() === 'GET' &&
						url.pathname.replace(/\/+$/, '') === '/wp-json' &&
						url.searchParams.has('wcpos')
					) {
						const response = await route.fetch();
						if (!response.ok()) return route.fulfill({ response });
						return route.fulfill({
							response,
							json: {
								...(await response.json()),
								license: freeLicense ? {} : { key: 'probe-pro' },
							},
						});
					}
					if (
						!path ||
						!/^\/wcpos\/v2\/(cashier\/|registers|sessions|movements|closures|receipts|templates)/.test(
							path
						)
					)
						return route.fallback();
					const headers = {
						'access-control-allow-origin': '*',
						'access-control-allow-methods': 'GET, POST, OPTIONS',
						'access-control-allow-headers':
							request.headers()['access-control-request-headers'] ?? '*',
					};
					if (request.method() === 'OPTIONS') return route.fulfill({ headers, status: 200 });
					if (path.includes('/cashier/')) {
						const response = await route.fetch();
						if (!response.ok()) return route.fulfill({ response });
						const body = await response.json();
						body.capabilities = [
							...new Set([
								...(body.capabilities ?? []),
								'view_woocommerce_pos_reports',
								'manage_woocommerce_pos_closures',
							]),
						];
						body.stores = body.stores.map((store: Record<string, unknown>) => ({
							...store,
							register_sessions: true,
							currency: 'USD',
							timezone: 'UTC',
							// Pin the fixture locale so named scope assertions use the bundled catalog.
							locale: 'en',
							active_templates: [],
						}));
						return route.fulfill({ response, json: body });
					}
					if (path === `/wcpos/v2/closures/${probe.ids[1]}/print` && request.method() === 'POST') {
						probe.printRequests.push(request.url());
						return route.fulfill({
							headers,
							json: { print_count: 2, last_printed_at_gmt: new Date().toISOString() },
						});
					}
					if (
						path === `/wcpos/v2/closures/${probe.ids[1]}/recount` &&
						request.method() === 'POST'
					) {
						const body = request.postDataJSON() as Probe['recounts'][number];
						probe.recounts.push(body);
						const correction: Correction = {
							...corrections[0],
							id: corrections.length + 1,
							reason: body.reason,
							created_at: new Date().toISOString(),
							figures: {
								counted: Object.fromEntries(
									Object.entries(body.counted).map(([tender, amount]) => [
										tender,
										Number(amount).toFixed(4),
									])
								),
								variance: { cash: '1.0000', card: '0.0000' },
							},
						};
						corrections.push(correction);
						return route.fulfill({ headers, status: 201, json: correction });
					}
					// Fail closed for unexpected financial writes; never fall through to the store.
					if (request.method() !== 'GET') {
						probe.unexpectedWrites.push(`${request.method()} ${path}`);
						return route.fulfill({
							headers,
							status: 405,
							json: { message: 'Unexpected probe write' },
						});
					}
					if (path === '/wcpos/v2/registers')
						return route.fulfill({
							headers,
							json: [
								{ id: registerId, name: 'Reports probe', status: 'active', default_float: '100' },
							],
						});
					if (path.startsWith('/wcpos/v2/registers/'))
						return route.fulfill({
							headers,
							json: {
								id: registerId,
								counters: {
									last_closure_number: 2,
									perpetual_sales_total: '0',
									perpetual_refunds_total: '0',
								},
							},
						});
					if (path.startsWith('/wcpos/v2/sessions')) return route.fulfill({ headers, json: [] });
					if (path === '/wcpos/v2/templates')
						return route.fulfill({
							headers,
							json:
								url.searchParams.get('type') === 'closure'
									? [
											{
												uuid: registerId,
												id: templateId,
												title: 'Default closure probe',
												type: 'closure',
												engine: 'logicless',
												output_type: 'html',
												paper_width: null,
												content: templateContent,
												offline_capable: true,
												is_active: true,
												is_virtual: true,
												status: 'publish',
												menu_order: 0,
											},
										]
									: [],
						});
					if (path === '/wcpos/v2/closures') {
						probe.closureRequests.push(request.url());
						const after = url.searchParams.get('after') ?? '';
						const before = url.searchParams.get('before') ?? '9999';
						return route.fulfill({
							headers,
							json: rows
								.filter((row) => row.business_day >= after && row.business_day <= before)
								.map((row) => ({
									...row,
									store_id: Number(url.searchParams.get('store_id') ?? 0),
								})),
						});
					}
					if (path === '/wcpos/v2/closures/last') return route.fulfill({ headers, json: rows[1] });
					if (path.startsWith('/wcpos/v2/closures/'))
						return route.fulfill({ headers, json: { ...rows[1], corrections } });
					if (
						path === '/wcpos/v2/receipts/0' &&
						url.searchParams.get('document')?.startsWith('closure:')
					) {
						if (url.searchParams.has('intent')) probe.receiptIntents.push(request.url());
						return route.fulfill({
							headers,
							json: {
								order_id: 0,
								mode: 'fiscal',
								has_snapshot: true,
								submission_status: 'sent',
								data: {
									...serverDocument,
									store: { name: 'Reports probe store', address_lines: [] },
									register: { name: 'Reports probe' },
									fiscal: { ...serverDocument.fiscal, receipt_number: String(rows[1].number) },
									closure: { ...rows[1], corrections },
								},
							},
						});
					}
					return route.fulfill({ headers, status: 404, json: { message: 'No probe record' } });
				});
			},
		});
		// eslint-disable-next-line react-hooks/rules-of-hooks -- Playwright fixture callback
		await use(page);
		expect(probe.unexpectedWrites).toEqual([]);
		await page.unrouteAll({ behavior: 'ignoreErrors' });
	},
});

async function openClosures(page: Page) {
	if (!(await page.getByTestId('drawer-item-reports').isVisible())) {
		await page.getByTestId('pos-drawer-open-button').click();
	}
	await page.getByTestId('drawer-item-reports').click();
	await page.getByTestId('reports-room-closures').click();
	await expect(page.getByTestId('reports-closures')).toBeVisible();
}

for (const viewport of viewports) {
	test.describe(viewport.name, () => {
		test.use({ viewport: { width: viewport.width, height: viewport.height } });

		// Revert: remove stamped grouping, settled derivation, single print mutation/copy
		// marking, recount refetch or CSV dispatch; the corresponding walk assertion fails.
		test('walks grouped closures, settled recount, reprint and CSV', async ({
			posPage: page,
			probe,
		}, testInfo) => {
			await openClosures(page);
			await page.getByTestId('reports-period').click();
			const listResponse = page.waitForResponse(
				(response) => wcposRestRoute(response.url()) === '/wcpos/v2/closures'
			);
			await page.getByTestId('reports-period-lastMonth').click();
			expect((await listResponse).status()).toBe(200);
			await page.keyboard.press('Escape');
			for (const day of businessDays)
				await expect(page.getByTestId(`closure-day-${day}`)).toBeVisible();
			await expect(page.getByTestId('reports-session-print')).toBeVisible();
			await expect(page.getByTestId(`closure-badge-${probe.ids[1]}`)).toBeVisible();
			await expect(page.getByTestId(`closure-badge-${probe.ids[0]}`)).toHaveCount(0);
			await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-list.png`) });
			await page.getByTestId(`closure-row-${probe.ids[1]}`).click();
			await expect(page.getByTestId('closure-panel')).toBeVisible();
			await expect(page.getByTestId('receipt-template-select')).toContainText(
				'Default closure probe'
			);
			const preview = page.getByTestId('receipt-preview-frame').contentFrame();
			await expect(preview.getByTestId('probe-recorded-cash')).toHaveText('$178.00');
			// This testID's deliberate referent is the Recorded → Settled pair, not a label.
			await expect(page.getByTestId('closure-settled-counted.cash')).toContainText(/178.*→.*180/);
			await expect(page.getByTestId(`closure-correction-${correctionId}`)).toContainText(
				'Original probe recount'
			);
			await expect(page.getByTestId('closure-recount')).toBeInViewport();
			await expect(page.getByTestId('closure-reprint')).toBeInViewport();
			await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-drill-in.png`) });
			const printResponse = page.waitForResponse(
				(response) =>
					wcposRestRoute(response.url()) === `/wcpos/v2/closures/${probe.ids[1]}/print` &&
					response.request().method() === 'POST'
			);
			await page.getByTestId('closure-reprint').click();
			expect((await printResponse).status()).toBe(200);
			await expect
				.poll(() => probe.printed)
				.toEqual([{ copy: 'COPY', count: '2', recorded: '$178.00' }]);
			expect(probe.printRequests).toHaveLength(1);
			expect(probe.receiptIntents).toEqual([]);
			await page.getByTestId('closure-recount').click();
			await page.getByTestId('recount-cash').fill('181');
			await page.getByTestId('recount-card').fill('120');
			await page.getByTestId('recount-reason').fill(recountReason);
			const recountResponse = page.waitForResponse(
				(response) =>
					wcposRestRoute(response.url()) === `/wcpos/v2/closures/${probe.ids[1]}/recount` &&
					response.request().method() === 'POST'
			);
			await page.getByTestId('recount-save').click();
			const savedResponse = await recountResponse;
			expect(savedResponse.status()).toBe(201);
			const savedCorrection = (await savedResponse.json()) as Correction;
			expect(probe.recounts).toEqual([
				{ id: expect.any(String), counted: { cash: '181', card: '120' }, reason: recountReason },
			]);
			await expect(page.getByTestId('recount-sheet')).toHaveCount(0);
			await expect(page.getByTestId(`closure-correction-${savedCorrection.id}`)).toContainText(
				recountReason
			);
			await expect(page.getByTestId('closure-settled-counted.cash')).toContainText(/178.*→.*181/);
			await expect(preview.getByTestId('probe-recorded-cash')).toHaveText('$178.00');
			if (viewport.name === 'phone') await page.getByTestId('closure-back').click();
			else await page.keyboard.press('Escape');
			await expect(page.getByTestId('closure-panel')).toHaveCount(0);
			await page.getByTestId('closures-overflow').click();
			const downloaded = page.waitForEvent('download');
			await page.getByTestId('closures-export').click();
			const download = await downloaded;
			expect(download.suggestedFilename()).toMatch(/^closures-.*\.csv$/);
			await download.saveAs(testInfo.outputPath(`${viewport.name}-closures.csv`));
			expect(await download.failure()).toBeNull();
			expect(probe.printRequests).toHaveLength(1);
		});

		test.describe('Free', () => {
			test.use({ freeLicense: true });
			// Revert: allow a non-Today period or activate the Pro server pager for Free;
			// the named locked hint or zero-request assertion fails under the Pro project too.
			test('locks historical dates without issuing a closures request', async ({
				posPage: page,
				probe,
			}, testInfo) => {
				await openClosures(page);
				await page.getByTestId('reports-period').click();
				await expect(page.getByTestId('reports-period-today')).not.toHaveClass(/opacity-50/);
				for (const [period, scopeName] of [
					['previous', en['reports.earlier_closures']],
					['yesterday', en['reports.earlier_closures']],
					['thisWeek', en['common.this_week']],
					['lastWeek', en['common.last_week']],
					['thisMonth', en['common.this_month']],
					['lastMonth', en['common.last_month']],
					['custom', en['reports.custom_ranges']],
				]) {
					const option = page.getByTestId(`reports-period-${period}`);
					await expect(option).toHaveClass(/opacity-50/);
					await option.click();
					await expect(page.getByTestId('reports-lock-hint')).toBeVisible();
					await expect(page.getByTestId('reports-lock-hint')).toHaveText(
						en['reports.pro_scope'].replace('{scope}', scopeName)
					);
					await expect(page.getByTestId('reports-see-pro')).toHaveCount(1);
					await expect(page.getByTestId('reports-see-pro')).toBeVisible();
					expect(probe.closureRequests).toEqual([]);
				}
				await page.screenshot({ path: testInfo.outputPath(`${viewport.name}-free-hint.png`) });
				expect(probe.closureRequests).toEqual([]);
			});
		});
	});
}
