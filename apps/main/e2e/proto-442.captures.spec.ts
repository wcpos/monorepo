// PROTOTYPE (roadmap#442) — throwaway screenshots for Paul's reaction, never merge.
import { hydrateAuthenticatedPage } from './fixtures';
import { expect, test } from './test';

test.skip(process.env.CAPTURES !== '1', 'Prototype captures run only with CAPTURES=1');

for (const [device, viewport] of Object.entries({
	tablet: { width: 1024, height: 768 },
	phone: { width: 390, height: 844 },
})) {
	for (const colorScheme of ['light', 'dark'] as const) {
		test.describe(`${device}-${colorScheme}`, () => {
			test.use({ viewport, colorScheme, hasTouch: device === 'phone' });
			test('screen error variants', async ({ page }, info) => {
				test.setTimeout(240_000);
				page.setDefaultTimeout(30_000);
				await hydrateAuthenticatedPage(page, info);
				await page.goto('/reports?variant=a');
				for (const variant of ['a', 'b', 'c']) {
					await expect(page).toHaveURL(new RegExp(`variant=${variant}`));
					await expect(page.getByTestId('proto-screen-error-retry')).toBeVisible();
					await page.waitForTimeout(500);
					const path = info.outputPath(`${device}-${colorScheme}--${variant}.png`);
					await page.screenshot({ path });
					await info.attach(variant, { path, contentType: 'image/png' });
					if (variant === 'b') {
						await page.getByTestId('proto-screen-error-details').click();
						await page.waitForTimeout(400);
						const details = info.outputPath(`${device}-${colorScheme}--b-details.png`);
						await page.screenshot({ path: details });
					}
					await page.getByTestId('proto-screen-error-next').click();
				}
				// Try again models the remount: the real Reports screen comes back.
				await page.getByTestId('proto-screen-error-retry').click();
				await page.waitForTimeout(1500);
				await page.screenshot({ path: info.outputPath(`${device}-${colorScheme}--recovered.png`) });
			});
		});
	}
}
