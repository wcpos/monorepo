import { expect, type Page, type TestInfo } from '@playwright/test';

import type { CartAddTiming } from '../../../packages/core/src/screens/main/pos/hooks/cart-add-timing';

const readout = (page: Page) => page.getByTestId('e2e-cart-add-timing');
async function readSample(page: Page): Promise<CartAddTiming> {
	return JSON.parse((await readout(page).textContent()) ?? 'null');
}

export async function beginCartAddMeasurement(page: Page): Promise<number> {
	// Opt in on the deployed web bundle too; do not change production logging/build flags.
	await page.evaluate(() => {
		(
			globalThis as typeof globalThis & { __WCPOS_E2E_CART_TIMING__?: boolean }
		).__WCPOS_E2E_CART_TIMING__ = true;
	});
	// There is no readout before the first instrumented add causes a render.
	return (await readout(page).count()) ? (await readSample(page)).sequence : 0;
}

export async function expectCartAddMeasurement(
	page: Page,
	before: number,
	testInfo: TestInfo,
	budgetMs: number
): Promise<void> {
	try {
		await expect
			.poll(
				async () => {
					const sample = await readSample(page);
					return { sequence: sample.sequence, status: sample.status };
				},
				{ timeout: 15_000 }
			)
			.toEqual({ sequence: before + 1, status: 'complete' });
		const sample = await readSample(page);
		expect(Number.isFinite(sample.durationMs)).toBe(true);
		expect(sample.durationMs).toBeGreaterThanOrEqual(0);
		expect(
			sample.durationMs,
			'add handler → expected quantity committed (not touch-to-paint)'
		).toBeLessThanOrEqual(budgetMs);
	} finally {
		await testInfo.attach('cart-add-performance', {
			body: JSON.stringify({
				metric: 'add-handler-to-cart-commit',
				platform: 'web',
				project: testInfo.project.name,
				budgetMs,
				rawSamples: await readout(page).allTextContents(),
			}),
			contentType: 'application/json',
		});
	}
}
