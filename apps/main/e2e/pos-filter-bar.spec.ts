/**
 * The POS filter bar and its editor (roadmap wcpos/roadmap#63).
 *
 * Store-agnostic per CLAUDE.md: nothing here depends on what the store sells. The quick
 * filter authored below uses conditions that exist on every store (on sale, sorted by
 * price), the assertions read the app's own query state through the built-in pill's
 * remove affordance, and every change the spec makes to the device's filter-bar setting is
 * undone in a `finally` so the profile is left as it was found.
 */
import { expect, type Page } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';

const QUICK_FILTER_TESTID = /^quick-filter-[0-9a-f-]{36}$/;

async function openFilterBarEditor(page: Page): Promise<void> {
	await page.getByTestId('filter-bar-customize').click();
	await expect(page.getByTestId('filter-bar-add-quick-filter')).toBeVisible({ timeout: 10_000 });
}

async function closeFilterBarEditor(page: Page): Promise<void> {
	await page.getByTestId('filter-bar-modal-close').click();
	await expect(page.getByTestId('filter-bar-add-quick-filter')).toBeHidden({ timeout: 10_000 });
}

test('the filter bar renders the built-in pills and the customise affordance', async ({
	posPage: page,
}) => {
	await expect(page.getByTestId('filter-pill-stock_status')).toBeVisible();
	await expect(page.getByTestId('filter-pill-featured')).toBeVisible();
	await expect(page.getByTestId('filter-pill-on_sale')).toBeVisible();
	await expect(page.getByTestId('filter-pill-categories')).toBeVisible();
	await expect(page.getByTestId('filter-bar-customize')).toBeVisible();
});

test('a quick filter authored in the editor applies and clears its conditions from the bar', async ({
	posPage: page,
}) => {
	const label = `QF ${Date.now()}`;
	let quickFilterId: string | null = null;

	try {
		await openFilterBarEditor(page);
		await page.getByTestId('filter-bar-add-quick-filter').click();
		await page.getByTestId('quick-filter-name').fill(label);

		// Save stays disabled until the button has something to apply.
		await expect(page.getByTestId('quick-filter-save')).toBeDisabled();

		// One condition: "On sale" — the first row defaults to Category, so switch its field.
		await page.getByTestId('quick-filter-add-condition').click();
		await page.getByTestId('quick-filter-condition-field-0').click();
		await page.getByTestId('quick-filter-condition-option-0-on_sale').click();
		await expect(page.getByTestId('quick-filter-toggle-on_sale')).toBeVisible();

		// A sort, so the button carries an order as well as a filter.
		await page.getByTestId('quick-filter-sort-field').click();
		await page.getByTestId('quick-filter-sort-option-sortable_price').click();
		await page.getByTestId('quick-filter-sort-direction-desc').click();

		// The preview reports a device-local count; its exact value is the store's business.
		await expect(page.getByTestId('quick-filter-preview-count')).toBeVisible({ timeout: 15_000 });

		await expect(page.getByTestId('quick-filter-save')).toBeEnabled();
		await page.getByTestId('quick-filter-save').click();

		// The new button is appended, so it is the last quick filter on the list pane.
		const editRow = page.getByTestId(/^filter-bar-edit-[0-9a-f-]{36}$/).last();
		await expect(editRow).toBeVisible();
		quickFilterId = (await editRow.getAttribute('data-testid'))!.replace('filter-bar-edit-', '');
		await closeFilterBarEditor(page);

		const button = page.getByTestId(`quick-filter-${quickFilterId}`);
		await expect(button).toBeVisible();
		expect(await button.textContent()).toContain(label);

		// Press → the On sale pill goes active (its remove affordance appears).
		await expect(page.getByTestId('filter-pill-remove-on_sale')).toBeHidden();
		await button.click();
		await expect(page.getByTestId('filter-pill-remove-on_sale')).toBeVisible({ timeout: 10_000 });

		// Press again → back to the baseline.
		await button.click();
		await expect(page.getByTestId('filter-pill-remove-on_sale')).toBeHidden({ timeout: 10_000 });
	} finally {
		if (quickFilterId) {
			await openFilterBarEditor(page);
			await page.getByTestId(`filter-bar-delete-${quickFilterId}`).click();
			await page.getByTestId('filter-bar-delete-confirm').click();
			await expect(page.getByTestId(`filter-bar-edit-${quickFilterId}`)).toBeHidden();
			await closeFilterBarEditor(page);
			await expect(page.getByTestId(QUICK_FILTER_TESTID).filter({ hasText: label })).toHaveCount(0);
		}
	}
});

test('a built-in pill can be hidden from the bar and shown again', async ({ posPage: page }) => {
	await expect(page.getByTestId('filter-pill-featured')).toBeVisible();
	try {
		await openFilterBarEditor(page);
		await page.getByTestId('filter-bar-toggle-featured').click();
		await closeFilterBarEditor(page);
		await expect(page.getByTestId('filter-pill-featured')).toBeHidden();
	} finally {
		await openFilterBarEditor(page);
		const toggle = page.getByTestId('filter-bar-toggle-featured');
		if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
		await closeFilterBarEditor(page);
		await expect(page.getByTestId('filter-pill-featured')).toBeVisible();
	}
});
