/**
 * roadmap#540: J12 "Find a product", walking `find-a-product.ts` on the default viewport and on a
 * phone, and twice in one test to prove the walk ends where it started (soak-loopable).
 *
 * The walk writes no product; its one cart line is voided in step 9. `restoreProductPanel` runs
 * in a `finally`, so a failed walk still leaves the device's panel settings as it found them.
 */
import { expect, type Page, type TestInfo } from '@playwright/test';

import { CAPTURE_DEVICES } from '../capture-matrix';
import { getStoreVariant, authenticatedTest as test } from '../fixtures';
import {
	DECLARED_GAP,
	findAProduct,
	type FindAProductContext,
	type ProductWalk,
	restoreProductPanel,
} from './find-a-product';

type Fixtures = Omit<FindAProductContext, 'page' | 'testInfo'> & { posPage: Page };

function journeyContext({ posPage, ...fixtures }: Fixtures, testInfo: TestInfo) {
	return { page: posPage, testInfo, ...fixtures } satisfies FindAProductContext;
}

/** Run `walks` walks, restoring the panel afterwards without masking the walk's own failure. */
async function walk(ctx: FindAProductContext, walks = 1): Promise<ProductWalk[]> {
	const done: ProductWalk[] = [];
	let failed = true;
	try {
		for (let index = 0; index < walks; index += 1) done.push(await findAProduct(ctx));
		failed = false;
	} finally {
		await restoreProductPanel(ctx.page).catch((error: unknown) => {
			if (!failed) throw error;
		});
	}
	return done;
}

/** dev-pro carries a scannable SKU and a variable product, so no step there may pass over. */
function expectNoGapOnPro(testInfo: TestInfo) {
	if (getStoreVariant(testInfo) !== 'pro') return;
	const gaps = testInfo.annotations.filter((annotation) => annotation.type === DECLARED_GAP);
	expect(gaps, 'no declared gap on the Pro store').toEqual([]);
}

test.describe('J12 Find a product', () => {
	test('a cashier finds a product every way the panel offers', async ({
		posPage,
		request,
		storeAuthorization,
	}, testInfo) => {
		test.slow();
		const [found] = await walk(journeyContext({ posPage, request, storeAuthorization }, testInfo));
		expect(found.layout).toBe('columns');
		expectNoGapOnPro(testInfo);
	});

	test('the walk ends where it started', async ({
		posPage,
		request,
		storeAuthorization,
	}, testInfo) => {
		test.slow();
		const walks = await walk(journeyContext({ posPage, request, storeAuthorization }, testInfo), 2);
		expect(walks).toHaveLength(2);
		// The second walk read the same store and found the same products: nothing was left behind.
		expect(walks[1].catalogue).toEqual(walks[0].catalogue);
	});

	test.describe('on a phone', () => {
		test.use({ viewport: CAPTURE_DEVICES.phone });

		test('a cashier finds a product every way the panel offers', async ({
			posPage,
			request,
			storeAuthorization,
		}, testInfo) => {
			test.slow();
			const ctx = journeyContext({ posPage, request, storeAuthorization }, testInfo);
			const [found] = await walk(ctx);
			expect(found.layout).toBe('phone');
			expectNoGapOnPro(testInfo);
		});
	});
});
