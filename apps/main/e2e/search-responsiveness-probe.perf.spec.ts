import { expect, test } from '@playwright/test';

import { expectSearchResponsive, measureSearch } from './search-responsiveness';

// Control experiments distinguish app cost from the probe/runner's cost. No React,
// network, database, timers, or synthetic event dispatch in the plain control.
test('frame probe accepts an ordinary browser input', async ({ page }, testInfo) => {
	await page.setContent('<input data-testid="search-control">');
	expectSearchResponsive(
		await measureSearch(page, 'search-control', testInfo, 'control'),
		'control'
	);
});

test('frame probe catches a blocking input handler', async ({ page }, testInfo) => {
	await page.setContent('<input data-testid="search-control">');
	await page.getByTestId('search-control').evaluate((input) => {
		input.addEventListener('input', () => {
			const deadline = performance.now() + 80;
			while (performance.now() < deadline) {
				/* Deliberate jank: verify the detector. */
			}
		});
	});
	const measurement = await measureSearch(page, 'search-control', testInfo, 'blocking-control');
	expect(measurement.droppedFrames.length).toBeGreaterThan(0);
	expect(measurement.missedFrames.length).toBeGreaterThan(0);
	expect(measurement.longTasks.length).toBeGreaterThan(0);
});
