import { expect } from '@playwright/test';

import { navigateToPage, authenticatedTest as test } from './fixtures';
import { expectSearchResponsive, measureSearch } from './search-responsiveness';

// One session, all six QuerySearchInput surfaces. Unlike search-heap, this sends
// keyboard events fast enough to exercise the scanner and permits NO jank.
// Soft metric assertions keep collecting evidence from the remaining screens.
test('every screen search preserves typing and meets the frame budget', async ({
	posPage: page,
}, testInfo) => {
	test.setTimeout(300_000);
	for (const route of ['pos', 'products', 'orders', 'customers', 'coupons', 'health'] as const) {
		await test.step(route, async () => {
			if (route !== 'pos') await navigateToPage(page, route);
			if (route === 'health') await page.getByTestId('health-nav-logs').click();
			const collection = route === 'pos' ? 'products' : route === 'health' ? 'logs' : route;
			expectSearchResponsive(
				await measureSearch(page, `search-${collection}`, testInfo, route),
				route
			);
		});
	}
});

test('searchable filters and settings meet the frame budget', async ({
	posPage: page,
}, testInfo) => {
	const dropdown = async (trigger: string, label: string, input = 'combobox-search') => {
		await test.step(label, async () => {
			await page.getByTestId(trigger).filter({ visible: true }).click();
			expectSearchResponsive(await measureSearch(page, input, testInfo, label), label);
			await page.keyboard.press('Escape');
			await expect(page.getByTestId(input).filter({ visible: true })).toHaveCount(0);
		});
	};
	await page.getByTestId('add-cart-item-menu').click();
	await page.getByTestId('menu-add-coupon').click();
	await dropdown('add-coupon-combobox', 'coupon-picker', 'add-coupon-search-input');
	await page.keyboard.press('Escape');
	await dropdown('filter-pill-categories', 'category-tree', 'tree-combobox-search');
	await dropdown('filter-pill-tags', 'tags');
	await dropdown('filter-pill-brands', 'brands');
	await navigateToPage(page, 'orders');
	await dropdown('order-filter-cashier', 'cashiers');
	await dropdown('order-filter-customer', 'order-customers');
	await navigateToPage(page, 'settings');
	await page.getByTestId('settings-nav-general').click();
	await dropdown('language-select-trigger', 'languages', 'language-search-input');
	await dropdown('currency-select-trigger', 'currencies');
	await dropdown('customer-select-trigger', 'customer-picker');
});

test('address dropdown searches meet the frame budget', async ({ posPage: page }, testInfo) => {
	const dropdown = async (trigger: string, label: string, input = 'combobox-search') => {
		await test.step(label, async () => {
			await page.getByTestId(trigger).filter({ visible: true }).click();
			expectSearchResponsive(await measureSearch(page, input, testInfo, label), label);
			await page.keyboard.press('Escape');
			await expect(page.getByTestId(input).filter({ visible: true })).toHaveCount(0);
		});
	};
	await navigateToPage(page, 'customers');
	const add = page.getByTestId('customers-add-button');
	test.skip(
		await add.isDisabled(),
		'This cashier lacks the create-customer capability needed to open an unsaved address form'
	);
	await add.click();
	await page.getByTestId('customer-billing-address-toggle').click();
	await dropdown('country-select-trigger', 'countries');
	await page.getByTestId('country-select-trigger').filter({ visible: true }).click();
	await page.getByTestId('country-option-US').click();
	await dropdown('state-select-trigger', 'states');
	// No record is saved: the country change belongs only to this discarded draft.
	await page.getByTestId('customer-form-close').click();
});
