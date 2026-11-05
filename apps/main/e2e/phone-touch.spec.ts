import { expect } from '@playwright/test';

import {
	ensureRegisterOpen,
	getStoreVariant,
	authenticatedTest as test,
	tryAddProductBySku,
} from './fixtures';

/**
 * roadmap#505: a phone's taps through the cart's add menu, Add Discount and the coupon picker.
 * A Radix trigger opens on pointer-down, so a phone sheet's scrim mounts under the finger: the
 * tap's own click must not dismiss it. And the picker's sheet, opened over the modal discount
 * dialog (which puts `pointer-events: none` on the body), must still take touches.
 */
const OPTION = '[data-testid^="add-coupon-option-"]';

test.describe('Phone touch', () => {
	test.use({
		viewport: { width: 412, height: 915 },
		deviceScaleFactor: 2.625,
		isMobile: true,
		hasTouch: true,
	});
	test.beforeEach(async ({}, testInfo) => {
		// The touch path is the same on both stores; dev-free's coupon list carries it.
		test.skip(getStoreVariant(testInfo) !== 'free', 'Runs against the free store only');
	});

	test('taps open the add menu and Add Discount, pick a coupon over the dialog, and the scrim closes the picker', async ({
		posPage: page,
	}) => {
		const visible = (id: string) => page.getByTestId(id).locator('visible=true').first();
		await visible('pos-tab-products').tap();
		expect(await tryAddProductBySku(page), 'the shared SKU reaches the cart').toBe('added');
		await visible('pos-tab-cart').tap();
		await ensureRegisterOpen(page);

		await visible('add-cart-item-menu').tap();
		const addDiscount = visible('menu-add-discount');
		await expect(addDiscount).toBeVisible();
		// A menu dismissed by the tap's own click has played its exit by now.
		await page.waitForTimeout(500);
		await expect(addDiscount).toBeVisible();

		await addDiscount.tap();
		const dialog = visible('add-discount-dialog');
		await expect(dialog).toBeVisible();
		await visible('add-discount-kind-coupon').tap();
		const picker = visible('add-coupon-combobox');
		await picker.tap();
		const option = page.locator(OPTION).locator('visible=true').first();
		await expect(option).toBeVisible();
		const code = (await option.innerText()).split('\n')[0].trim();
		// Under the dialog's body lock the coupon never takes the tap: fail here, not at the test's end.
		await option.tap({ timeout: 10_000 });
		await expect(page.locator(OPTION).locator('visible=true')).toHaveCount(0);
		await expect(picker).toContainText(code);
		await expect(dialog).toBeVisible();

		await picker.tap();
		await expect(option).toBeVisible();
		// The picker's sheet has no testID of its own: its scrim is the shell's fallback.
		await visible('overlay-scrim').tap({ position: { x: 206, y: 40 } });
		await expect(page.locator(OPTION).locator('visible=true')).toHaveCount(0);
	});
});
