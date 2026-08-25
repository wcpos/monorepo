import { expect, type Locator, type Page } from '@playwright/test';

import { isolatedVariationMatrixTest as test, variationMatrixProbe } from './checkout-probe';
import { becomesVisible } from './fixtures';
import { ensureGridView } from './pos-view-mode';
import { searchAndWaitForServer } from './search-probe';

/**
 * The variation popover's button states.
 *
 * A popover option is greyed by either of two independent rules — `buttons.tsx` renders
 * `disabled={optionCounts[option] === 0 || disabledOptions[option]}`:
 *
 * 1. AVAILABILITY — no variation exists for this option given what is already selected.
 * 2. STOCK — variations exist, but every one of them sits outside the Stock Status filter.
 *
 * They come from different code (`parseAttributes` vs `getDisabledVariationOptions`), they fail
 * differently, and until now neither was covered: the existing popover specs only walk the happy
 * path until Add to Cart appears, which passes whatever the greying does. #1574 was rule 2
 * silently answering the wrong question for a year of pill states.
 *
 * Driven from GRID view, through the product TILE. Grid is the shipped default view, and the
 * tile is its own popover trigger — `pos-variations.spec.ts` covers the table row's chevron, so
 * a regression in the tile's trigger or its query-state wiring had no coverage at all.
 */

async function openMatrixPopover(page: Page, productId: number): Promise<Locator> {
	// The whole tile is the PopoverTrigger, addressed by its id-bearing testID so the assertion
	// names WHICH product it opened — most of a real catalogue is variable.
	const tile = page.getByTestId(`variable-product-tile-${productId}`);
	await expect(tile).toBeVisible({ timeout: 15_000 });
	await tile.click();

	const dialog = page.getByRole('dialog').last();
	await expect(dialog).toBeVisible({ timeout: 10_000 });

	// Option state derives from the LOCAL variations result, so every option renders disabled
	// until the lazy sync materializes. Sampling before then reads "everything is greyed" and
	// would pass this spec's disabled-assertions for entirely the wrong reason.
	const syncing = dialog.getByTestId('variation-popover-syncing');
	await expect(syncing).toHaveCount(0, { timeout: 30_000 });
	await expect(dialog.getByTestId('variation-option-Red')).toBeEnabled({ timeout: 30_000 });

	return dialog;
}

async function closePopover(page: Page) {
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
}

async function clearStockStatusPill(page: Page) {
	const remove = page.getByTestId('filter-pill-remove-stock_status');
	if (await becomesVisible(remove, 2_000)) {
		await remove.click();
	}
	await expect(remove).toHaveCount(0, { timeout: 10_000 });
}

async function setStockStatusPill(page: Page, value: 'instock' | 'outofstock' | 'onbackorder') {
	await page.getByTestId('filter-pill-stock_status').click();
	const option = page.getByTestId(`stock-status-option-${value}`);
	await expect(option).toBeVisible({ timeout: 10_000 });
	await option.click();
}

test.describe('POS variation popover option states', () => {
	test.beforeEach(async ({ posPage: page }) => {
		const probe = variationMatrixProbe(page);
		test.skip(
			probe === null,
			'No product-writer credentials configured — cannot seed the variation matrix'
		);
		await ensureGridView(page);
		await searchAndWaitForServer(
			page,
			page.getByTestId('screen-pos').getByTestId('search-products'),
			'products',
			probe!.token,
			page.getByTestId(`variable-product-tile-${probe!.id}`)
		);
		// Settings hydration can finish DURING the search and flip the mode back, which would
		// leave every tile assertion below hunting a surface that is no longer rendered and
		// reporting it as a product regression.
		await ensureGridView(page);
	});

	test('greys out a combination that does not exist once its partner is selected', async ({
		posPage: page,
	}) => {
		const probe = variationMatrixProbe(page)!;
		// Cleared, so nothing here can be greyed for stock reasons — availability alone is on trial.
		await clearStockStatusPill(page);
		const dialog = await openMatrixPopover(page, probe.id);

		// Both sizes exist somewhere in the matrix, so both start selectable.
		await expect(dialog.getByTestId('variation-option-Small')).toBeEnabled();
		await expect(dialog.getByTestId('variation-option-Large')).toBeEnabled();

		// Blue exists only in Small. Selecting it must strand Large, which is the whole point of
		// the rule: the cashier can never click their way into a combination the store lacks.
		await dialog.getByTestId('variation-option-Blue').click();
		await expect(dialog.getByTestId('variation-option-Large')).toBeDisabled({ timeout: 15_000 });
		await expect(dialog.getByTestId('variation-option-Small')).toBeEnabled();
	});

	test('greys out an option whose every variation sits outside the Stock Status filter', async ({
		posPage: page,
	}) => {
		const probe = variationMatrixProbe(page)!;

		// Cleared: Blue's only variation is backordered, which is still a variation the list is
		// showing — so the popover must offer it.
		await clearStockStatusPill(page);
		let dialog = await openMatrixPopover(page, probe.id);
		await expect(dialog.getByTestId('variation-option-Blue')).toBeEnabled({ timeout: 15_000 });
		await closePopover(page);

		// Narrowed to In stock: backordered is sellable but it is not in stock, so the expanded
		// table hides that row — and the popover must stop offering the colour that leads only
		// there. Before #1574 this asked "is it sellable?" and left Blue selectable.
		await setStockStatusPill(page, 'instock');
		dialog = await openMatrixPopover(page, probe.id);
		await expect(dialog.getByTestId('variation-option-Blue')).toBeDisabled({ timeout: 15_000 });
		// Red still has an in-stock variation, so it stays available — without this the assertion
		// above would also pass on a popover that greyed everything.
		await expect(dialog.getByTestId('variation-option-Red')).toBeEnabled();
	});

	test('a greyed option cannot be selected', async ({ posPage: page }) => {
		const probe = variationMatrixProbe(page)!;
		await clearStockStatusPill(page);
		const dialog = await openMatrixPopover(page, probe.id);

		await dialog.getByTestId('variation-option-Blue').click();
		const large = dialog.getByTestId('variation-option-Large');
		await expect(large).toBeDisabled({ timeout: 15_000 });

		// Disabling is enforced twice — the control's own `disabled`, and an early return in the
		// popover's select handler. Force past the first to prove the second holds: a click that
		// registered would resolve Blue/Large, a combination that does not exist.
		await large.click({ force: true });
		await expect(large).not.toHaveAttribute('data-state', 'on', { timeout: 5_000 });
		await expect(page.getByTestId('variation-popover-add-to-cart')).toHaveCount(0);
	});

	test('offers an unsellable combination but refuses to add it', async ({ posPage: page }) => {
		const probe = variationMatrixProbe(page)!;
		// Cleared, so the out-of-stock combination is in view and reachable.
		await clearStockStatusPill(page);
		const dialog = await openMatrixPopover(page, probe.id);

		// Red/Large exists and is out of stock. Resolving to it is allowed — the cashier is
		// entitled to see the price and the stock badge — but Add to Cart must refuse.
		await dialog.getByTestId('variation-option-Red').click();
		await dialog.getByTestId('variation-option-Large').click();

		const addToCart = page.getByTestId('variation-popover-add-to-cart');
		await expect(addToCart).toBeVisible({ timeout: 20_000 });
		await expect(addToCart).toBeDisabled();
	});
});
