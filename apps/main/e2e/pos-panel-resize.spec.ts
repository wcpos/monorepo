import { expect } from '@playwright/test';

import { authenticatedTest as test } from './fixtures';

/**
 * Drag distance is deliberately large and finely stepped: gesture-handler's web pan
 * recogniser needs a few pointer moves before it activates, so the first pixels of a
 * coarse drag are swallowed. Assert a band, not an exact delta.
 */
const DRAG_PX = 200;
const MIN_EXPECTED_SHRINK_PX = DRAG_PX * 0.6;
const MAX_EXPECTED_SHRINK_PX = DRAG_PX + 25;

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
	await page.mouse.move(startX - DRAG_PX, startY, { steps: 20 });
	await page.mouse.up();

	const widthNow = async () => (await products.boundingBox())?.width ?? 0;
	await expect.poll(widthNow).toBeLessThanOrEqual(before.width - MIN_EXPECTED_SHRINK_PX);
	expect(before.width - (await widthNow())).toBeLessThanOrEqual(MAX_EXPECTED_SHRINK_PX);
});
