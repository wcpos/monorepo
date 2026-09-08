import { expect, type Page, type TestInfo } from '@playwright/test';

type Sample = { status: 'armed' | 'pending' | 'complete' | 'overlap'; durationMs: number | null };
type MeasurementWindow = Window & {
	__WCPOS_CART_MEASUREMENT__?: { sample: Sample; stop: () => void };
};

export async function beginCartAddMeasurement(page: Page): Promise<void> {
	// This case owns an empty cart. Do not mistake a pre-existing quantity for this add.
	await expect(page.getByTestId('cart-quantity-input')).toHaveCount(0);
	await page.evaluate(() => {
		const runtime = window as MeasurementWindow;
		runtime.__WCPOS_CART_MEASUREMENT__?.stop();
		const sample: Sample = { status: 'armed', durationMs: null };
		let startedAt = 0;
		const observer = new MutationObserver(() => {
			if (sample.status !== 'pending') return;
			const quantity = document.querySelector('[data-testid="cart-quantity-input"]');
			if (quantity?.textContent?.trim() !== '1') return;
			sample.durationMs = performance.now() - startedAt;
			sample.status = 'complete';
			stop();
		});
		const onIntent = (event: Event) => {
			if (!(event.target instanceof Element)) return;
			const isClick =
				event.type === 'click' &&
				event.target.closest(
					'[data-testid="product-tile"], [data-testid^="product-tile-"], [data-testid="add-to-cart-button"]'
				);
			const isSubmit =
				event instanceof KeyboardEvent &&
				event.key === 'Enter' &&
				event.target.matches('[data-testid="search-products"]');
			if (!isClick && !isSubmit) return;
			if (sample.status !== 'armed') {
				sample.status = 'overlap';
				stop();
				return;
			}
			startedAt = performance.now();
			sample.status = 'pending';
		};
		function stop() {
			observer.disconnect();
			document.removeEventListener('click', onIntent, true);
			document.removeEventListener('keydown', onIntent, true);
		}
		runtime.__WCPOS_CART_MEASUREMENT__ = { sample, stop };
		observer.observe(document.body, { subtree: true, childList: true, characterData: true });
		document.addEventListener('click', onIntent, true);
		document.addEventListener('keydown', onIntent, true);
	});
}

export async function expectCartAddMeasurement(
	page: Page,
	testInfo: TestInfo,
	budgetMs: number
): Promise<void> {
	const readSample = () =>
		page.evaluate(() => (window as MeasurementWindow).__WCPOS_CART_MEASUREMENT__?.sample);
	try {
		await expect
			.poll(async () => (await readSample())?.status, { timeout: 15_000 })
			.toBe('complete');
		const sample = await readSample();
		expect(Number.isFinite(sample?.durationMs)).toBe(true);
		expect(sample?.durationMs).toBeGreaterThanOrEqual(0);
		expect(
			sample?.durationMs,
			'DOM add intent → expected cart quantity in DOM'
		).toBeLessThanOrEqual(budgetMs);
	} finally {
		await testInfo.attach('cart-add-performance', {
			body: JSON.stringify({
				metric: 'dom-add-intent-to-cart-quantity',
				platform: 'web',
				project: testInfo.project.name,
				budgetMs,
				rawSamples: [await readSample()],
			}),
			contentType: 'application/json',
		});
		await page.evaluate(() => (window as MeasurementWindow).__WCPOS_CART_MEASUREMENT__?.stop());
	}
}
