import { expect, type Page } from '@playwright/test';

/**
 * Enter an amount into a web form's money or percentage field. On web the outlined field
 * grows into the cart's price keypad (Paul 2026-10-27), and the physical keyboard types into
 * it while it is open: `.` and `,` are both the decimal key, so `9.99` types on a fr_FR store,
 * and Enter commits. The first digit replaces the stored amount.
 */
export async function fillKeypadField(page: Page, testID: string, value: string) {
	const trigger = page.getByTestId(testID);
	await expect(trigger).toBeVisible({ timeout: 15_000 });
	await trigger.click();
	const display = page.getByTestId('price-keypad-value');
	await expect(display).toBeVisible({ timeout: 5_000 });
	await page.keyboard.type(value);
	await page.keyboard.press('Enter');
	await expect(display).toBeHidden({ timeout: 5_000 });
}
