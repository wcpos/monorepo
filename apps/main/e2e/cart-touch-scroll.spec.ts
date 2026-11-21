import { expect, type Page } from '@playwright/test';

import { ensureRegisterOpen, getStoreVariant, authenticatedTest as test } from './fixtures';

async function touchDrag(
	page: Page,
	from: { x: number; y: number },
	to: { x: number; y: number },
	steps = 12
) {
	const session = await page.context().newCDPSession(page);
	await session.send('Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [{ ...from, id: 1 }],
	});
	for (let step = 1; step <= steps; step++) {
		await page.waitForTimeout(16);
		await session.send('Input.dispatchTouchEvent', {
			type: 'touchMove',
			touchPoints: [
				{
					x: from.x + ((to.x - from.x) * step) / steps,
					y: from.y + ((to.y - from.y) * step) / steps,
					id: 1,
				},
			],
		});
	}
	await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await session.detach();
}

// An overlay still animating out (the misc-product drawer's backdrop) swallows the touch.
async function untilRowIsUnder(page: Page, point: { x: number; y: number }) {
	await expect
		.poll(
			() =>
				page.evaluate(
					({ x, y }) =>
						!!document.elementFromPoint(x, y)?.closest('[data-testid="cart-line-body"]'),
					point
				),
			{ timeout: 5_000 }
		)
		.toBe(true);
}

async function fillCartUntilScrollable(page: Page) {
	const cartTab = page.getByTestId('pos-tab-cart');
	if (await cartTab.isVisible()) await cartTab.tap();
	await ensureRegisterOpen(page);
	const rows = page.getByTestId('cart-line-row');
	for (let added = 0; added < 20; added++) {
		const count = await rows.count();
		await page.getByTestId('add-cart-item-menu').click();
		await page.getByTestId('menu-add-misc-product').click();
		await page.getByTestId('add-to-cart-submit').click();
		if (await cartTab.isVisible()) await cartTab.tap();
		await expect(rows).toHaveCount(count + 1);
		if (
			await page
				.getByTestId('cart-table-scroll')
				.evaluate((el) => el.scrollHeight > el.clientHeight + 100)
		)
			return;
	}
	throw new Error('The cart did not become scrollable after 20 miscellaneous product adds');
}

async function scrollsAndSwipes(page: Page) {
	await fillCartUntilScrollable(page);
	const bodies = page.getByTestId('cart-line-body');
	const body = bodies.nth(1);
	expect(await body.evaluate((el) => getComputedStyle(el).touchAction)).toBe('pan-y');
	const scroller = page.getByTestId('cart-table-scroll');
	const scrollTop = () => scroller.evaluate((el) => el.scrollTop);
	expect(await scrollTop()).toBe(0);
	const scrollBox = (await scroller.boundingBox())!;
	const rowBox = (await body.boundingBox())!;
	const from = { x: rowBox.x + rowBox.width * 0.3, y: rowBox.y + rowBox.height / 2 };
	await untilRowIsUnder(page, from);
	await touchDrag(page, from, { x: from.x, y: Math.max(scrollBox.y + 1, from.y - 250) });
	await expect.poll(scrollTop, { timeout: 5_000 }).toBeGreaterThan(40);
	const visibleIndex = await bodies.evaluateAll(
		(elements, box) =>
			elements.findIndex((el) => {
				const rect = el.getBoundingClientRect();
				return rect.top >= box.y && rect.bottom <= box.y + box.height;
			}),
		scrollBox
	);
	expect(visibleIndex).toBeGreaterThanOrEqual(0);
	const swipeBody = bodies.nth(visibleIndex);
	const swipeBox = (await swipeBody.boundingBox())!;
	const restX = swipeBox.x;
	const restRight = swipeBox.x + swipeBox.width;
	// nth(visibleIndex): every cart-line-row renders exactly one body and one strip window, so the indexes pair.
	const swipeWindow = page.getByTestId('cart-line-strip-window').nth(visibleIndex);
	const swipeFrom = {
		x: swipeBox.x + swipeBox.width * 0.75,
		y: swipeBox.y + swipeBox.height / 2,
	};
	// The swipe moves the strip's window in from the row's trailing edge; the body holds still (decision 7A).
	await untilRowIsUnder(page, swipeFrom);
	await touchDrag(page, swipeFrom, { x: swipeFrom.x - 150, y: swipeFrom.y });
	await expect
		.poll(async () => (await swipeWindow.boundingBox())!.x, { timeout: 5_000 })
		.toBeLessThan(restRight - 40);
	expect(Math.abs((await swipeBody.boundingBox())!.x - restX)).toBeLessThanOrEqual(1);
}

test.describe('Cart touch scroll — phone', () => {
	test.use({
		viewport: { width: 412, height: 915 },
		deviceScaleFactor: 2.625,
		isMobile: true,
		hasTouch: true,
	});
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(
			getStoreVariant(testInfo) !== 'free',
			'The touch path is the same on both stores, so one store runs it'
		);
	});
	test('a vertical touch drag on a cart row scrolls the cart, and the row still swipes', async ({
		posPage: page,
	}) => {
		await scrollsAndSwipes(page);
	});
});

test.describe('Cart touch scroll — tablet', () => {
	test.use({
		viewport: { width: 1024, height: 768 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true,
	});
	// eslint-disable-next-line no-empty-pattern -- Playwright requires object destructuring for fixtures.
	test.beforeEach(async ({}, testInfo) => {
		test.skip(
			getStoreVariant(testInfo) !== 'free',
			'The touch path is the same on both stores, so one store runs it'
		);
	});
	test('a vertical touch drag on a cart row scrolls the cart, and the row still swipes', async ({
		posPage: page,
	}) => {
		await scrollsAndSwipes(page);
	});
});
