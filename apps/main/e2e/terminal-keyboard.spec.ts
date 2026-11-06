import { expect } from '@playwright/test';

import { ensureRegisterOpen, authenticatedTest as test } from './fixtures';

/**
 * roadmap#505: an on-screen keyboard shrinks only the visual viewport (Chrome on Android's
 * default), which is what RN-web's window dimensions follow. On a 1280x800 terminal it must not
 * flip the POS to the phone layout, which unmounts the cart's add menu and its open dialog. A
 * real resize, which moves the layout viewport too, still flips it.
 */
test.describe('Terminal keyboard', () => {
	test.use({ viewport: { width: 1280, height: 800 } });

	test('a keyboard keeps the columns and the dialog; a real resize still goes to the phone layout', async ({
		posPage: page,
	}) => {
		await ensureRegisterOpen(page);
		await expect(page.getByTestId('pos-resize-handle')).toBeVisible();
		await page.getByTestId('add-cart-item-menu').click();
		await page.getByTestId('menu-add-discount').click();
		const dialog = page.getByTestId('add-discount-dialog');
		await expect(dialog).toBeVisible({ timeout: 15_000 });

		// The keyboard: the visual viewport drops to 470 and fires the event RN-web listens to.
		await page.evaluate(() => {
			const viewport = window.visualViewport!;
			Object.defineProperty(viewport, 'height', { configurable: true, get: () => 470 });
			viewport.dispatchEvent(new Event('resize'));
		});
		// The flip, when it happens, is one render away.
		await page.waitForTimeout(1_000);
		await expect(dialog).toBeVisible();
		await expect(page.getByTestId('pos-resize-handle')).toBeVisible();
		await expect(page.getByTestId('pos-tab-bar')).toHaveCount(0);

		await page.setViewportSize({ width: 1280, height: 470 });
		await expect(page.getByTestId('pos-tab-bar')).toBeVisible({ timeout: 10_000 });
		await expect(page.getByTestId('pos-resize-handle')).toHaveCount(0);
	});
});
