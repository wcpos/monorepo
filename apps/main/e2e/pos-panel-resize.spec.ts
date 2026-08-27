import { expect } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';

test('resizes the visible POS products panel', async ({ posPage: page }) => {
	const screen = page.getByTestId('screen-pos').filter({ visible: true });
	const handle = screen.getByTestId('pos-resize-handle');
	test.skip(!(await handle.isVisible()), 'Small viewports do not render the split POS layout');

	const products = screen.getByTestId('pos-products-panel');
	const before = await products.boundingBox();
	const handleBox = await handle.boundingBox();
	if (!before || !handleBox) throw new Error('Visible POS split panels could not be measured');

	const startX = handleBox.x + handleBox.width / 2;
	const startY = handleBox.y + handleBox.height / 2;
	await page.mouse.move(startX, startY);
	await page.mouse.down();
	for (let step = 1; step <= 4; step++) {
		await page.mouse.move(startX - step * 30, startY);
	}
	await page.mouse.up();

	const after = await products.boundingBox();
	expect(after).not.toBeNull();
	expect(Math.abs(before.width - (after?.width ?? 0) - 120)).toBeLessThanOrEqual(25);
});
