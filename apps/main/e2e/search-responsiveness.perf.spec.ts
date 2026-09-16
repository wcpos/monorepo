import { expect, type Page, type TestInfo } from '@playwright/test';

import { navigateToPage, authenticatedTest as test } from './fixtures';
import { expectSearchResponsive, measureSearch } from './search-responsiveness';

// Independent cases keep each QuerySearchInput surface runnable and reportable.
for (const route of ['pos', 'products', 'orders', 'customers', 'coupons', 'health'] as const) {
	test(`screen: ${route} preserves typing and reports frame smoothness`, async ({
		posPage: page,
	}, testInfo) => {
		if (route !== 'pos') await navigateToPage(page, route);
		if (route === 'health') await page.getByTestId('health-nav-logs').click();
		const collection = route === 'pos' ? 'products' : route === 'health' ? 'logs' : route;
		expectSearchResponsive(
			await measureSearch(page, `search-${collection}`, testInfo, route),
			route
		);
	});
}

async function dropdown(
	page: Page,
	testInfo: TestInfo,
	trigger: string,
	label: string,
	input = 'combobox-search'
) {
	await page.getByTestId(trigger).filter({ visible: true }).click();
	expectSearchResponsive(await measureSearch(page, input, testInfo, label), label);
	await page.keyboard.press('Escape');
	await expect(page.getByTestId(input).filter({ visible: true })).toHaveCount(0);
}

// Separate cases make each search independently runnable and visible in the report.
// Never hide a failing surface behind a previous surface's navigation failure.
const dropdowns = [
	['pos', 'filter-pill-categories', 'category-tree', 'tree-combobox-search'],
	['pos', 'filter-pill-tags', 'tags', 'combobox-search'],
	['pos', 'filter-pill-brands', 'brands', 'combobox-search'],
	['pos', 'add-coupon-combobox', 'coupon-picker', 'add-coupon-search-input'],
	['orders', 'order-filter-cashier', 'cashiers', 'combobox-search'],
	['orders', 'order-filter-customer', 'order-customers', 'combobox-search'],
	['settings', 'language-select-trigger', 'languages', 'language-search-input'],
	['settings', 'currency-select-trigger', 'currencies', 'combobox-search'],
	['settings', 'customer-select-trigger', 'customer-picker', 'combobox-search'],
] as const;

for (const [route, trigger, label, input] of dropdowns) {
	test(`dropdown: ${label} preserves typing and reports frame smoothness`, async ({
		posPage: page,
	}, testInfo) => {
		if (route !== 'pos') await navigateToPage(page, route);
		if (route === 'settings') await page.getByTestId('settings-nav-general').click();
		if (label === 'coupon-picker') {
			await page.getByTestId('add-cart-item-menu').click();
			await page.getByTestId('menu-add-coupon').click();
		}
		await dropdown(page, testInfo, trigger, label, input);
	});
}

test('address dropdown searches preserve typing and report frame smoothness', async ({
	posPage: page,
}, testInfo) => {
	await navigateToPage(page, 'customers');
	const add = page.getByTestId('customers-add-button');
	test.skip(
		await add.isDisabled(),
		'This cashier lacks the create-customer capability needed to open an unsaved address form'
	);
	await add.click();
	await page.getByTestId('customer-billing-address-toggle').click();
	await dropdown(page, testInfo, 'country-select-trigger', 'countries');
	await page.getByTestId('country-select-trigger').filter({ visible: true }).click();
	await page.getByTestId('country-option-US').click();
	await dropdown(page, testInfo, 'state-select-trigger', 'states');
	// No record is saved: the country change belongs only to this discarded draft.
	await page.getByTestId('customer-form-close').click();
});
