import { expect, type Page } from '@playwright/test';

/**
 * Enter an amount into a web form's money or percentage field. On web the outlined field
 * grows into the cart's price keypad (Paul 2026-10-27); this presses its keys by testID, then
 * ✓. `.` and `,` both press the decimal key, so `9.99` enters on a fr_FR store. The first
 * digit replaces the stored amount.
 *
 * Keys, not `keyboard.type`: on the POS route the barcode wedge detector stays armed, and
 * typed characters arrive faster than its scanner threshold, so it takes all but the first
 * digit and the Enter (Codex, #2995). A text field is exempt from the detector; the keypad's
 * panel is not.
 */
export async function fillKeypadField(page: Page, testID: string, value: string) {
	const trigger = page.getByTestId(testID);
	await expect(trigger).toBeVisible({ timeout: 15_000 });
	await trigger.click();
	const display = page.getByTestId('price-keypad-value');
	await expect(display).toBeVisible({ timeout: 5_000 });
	for (const char of value) {
		const key = char === '.' || char === ',' ? 'decimal' : char;
		await page.getByTestId(`keypad-key-${key}`).click();
	}
	await page.getByTestId('numpad-done-button').click();
	await expect(display).toBeHidden({ timeout: 5_000 });
}
