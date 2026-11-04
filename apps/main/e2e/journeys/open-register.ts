/**
 * J1 "Open the register" as a shared start state for other journeys: this is J1's first step
 * only. The full J1 journey module (count in, float, close) is a later ticket (roadmap#514).
 */
import { expect, type Page, test } from '@playwright/test';

import { ensureRegisterOpen } from '../fixtures';

/** Phone when the tab bar's Products tab is on screen, else the columns layout. */
export async function posLayout(page: Page): Promise<'phone' | 'columns'> {
	const phoneTab = page.getByTestId('pos-tab-products').filter({ visible: true });
	const columns = page.getByTestId('pos-products-panel').filter({ visible: true });
	await expect(phoneTab.or(columns).first()).toBeVisible({ timeout: 30_000 });
	return (await phoneTab.count()) > 0 ? 'phone' : 'columns';
}

/**
 * On a phone the cart and the products grid are separate tabs, and both stay mounted, so a pane
 * can count as visible while off-screen. Tap until the tab reports selected.
 */
export async function showPhoneTab(page: Page, tab: 'products' | 'cart'): Promise<void> {
	const button = page.getByTestId(`pos-tab-${tab}`).filter({ visible: true });
	await expect(async () => {
		await button.click({ timeout: 5_000 });
		await expect(button).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 });
	}).toPass({ timeout: 30_000 });
}

/** J1 "Open the register" as a shared start state for other journeys. */
export async function openRegister(page: Page): Promise<void> {
	await test.step('Open the register', async () => {
		// The register card lives in the cart, which a phone shows on its Cart tab.
		const phone = (await posLayout(page)) === 'phone';
		if (phone) await showPhoneTab(page, 'cart');
		// Idempotent: an already-open register resolves on its ready cart header. Choosing a
		// register takes a phone back to Products, with the card still mounted off-screen.
		await ensureRegisterOpen(page, {
			afterPicking: phone ? () => showPhoneTab(page, 'cart') : undefined,
		});
	});
}
