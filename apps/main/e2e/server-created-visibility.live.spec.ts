import { expect } from '@playwright/test';

import { getStoreUrl, navigateToPage, authenticatedTest as test } from './fixtures';
import {
	createSearchProbe,
	deleteSearchProbe,
	productWriterAuthorization,
	productWriterCredentialsConfigured,
} from './search-probe';

/**
 * Directional coverage: a record created on the SERVER while the till is open
 * must reach the cashier without a manual sync (#1321).
 *
 * Every other product spec creates its probe and then SEARCHES for it, which
 * always issues server demand — so none of them can see a suppressed browse
 * lane. #1302 was exactly that blind spot for coupons: an idle maintenance
 * completion answered for the picker's open, and a coupon created in wp-admin
 * stayed invisible at the till. The class is only provable per surface, by
 * creating server-side and watching the surface a cashier would actually use.
 *
 * This spec deliberately never types a search term.
 *
 * STATUS: `.live.spec.ts`, so it is EXCLUDED from the default CI matrix — it
 * currently fails against dev-pro and the correct timeout is a product ruling,
 * not a test detail. Measured 2026-08-19 against dev-pro (see #1321):
 *
 *   run A (2 min budget):  total stayed 218          -> did not arrive
 *   run B (7 min budget):  "100+" -> 219             -> that was the INITIAL
 *                                                       window fill completing,
 *                                                       not a refresh
 *   run C (7 min, exact 218 baseline): stayed 218    -> no revalidation for at
 *                                                       least 7 minutes
 *
 * In every run a search found the record immediately, so the record syncs fine
 * on demand; it is the completed BROWSE window that does not revalidate. Decide
 * the intended latency, then either set this budget to it and promote the file
 * to a normal spec, or fix the browse lane and do the same.
 */
test.describe('Server-created records reach the till', () => {
	test('a product created on the server appears in the products grid without a search', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const writerAuthorization = await productWriterAuthorization(request, storeUrl);
		const authorization = writerAuthorization ?? storeAuthorization();

		// Land on the products grid FIRST and let it settle, so the browse lane
		// has already run for this window before the record exists. A product
		// created after that point can only arrive via a subsequent browse
		// refresh — which is the behaviour under test.
		await navigateToPage(page, 'products');
		const screen = page.getByTestId('screen-products').filter({ visible: true });
		const countEl = screen.getByTestId('data-table-count');
		await expect(countEl).toBeVisible({ timeout: 60_000 });
		// Wait for an EXACT total first. While the browse window is still filling
		// the footer reports an at-least count ("10 of 100+"), and a baseline taken
		// there would be beaten by ordinary coverage growth rather than by the
		// probe — the assertion would pass without proving anything.
		await expect
			.poll(async () => ((await countEl.textContent()) ?? '').includes('+'), {
				message: 'grid total never settled to an exact count',
				timeout: 180_000,
				intervals: [5_000],
			})
			.toBe(false);
		const countBefore = await countEl.textContent();
		console.log(`[directional] grid count before server create: ${countBefore}`);

		const created = await createSearchProbe({
			request,
			storeUrl,
			authorization,
			collection: 'products',
			workerIndex: testInfo.workerIndex,
			writerConfigured: Boolean(writerAuthorization),
			// Sorts to the top of the default menu_order/id grid so visibility does
			// not depend on scrolling the whole catalogue.
			productData: { menu_order: -1 },
		});
		if (!created.ok) {
			test.skip(
				true,
				productWriterCredentialsConfigured()
					? created.reason
					: `${created.reason} (E2E_PRODUCT_WRITER_USER/_PASS are not configured)`
			);
			return;
		}
		const probe = created.probe;

		try {
			if (!probe.rowTestId) {
				throw new Error('Server-created product probe is missing its slug-derived row testID');
			}
			// Assert on the grid's TOTAL, not on the probe row being rendered: the
			// grid renders a windowed slice in its own sort order, so a row that
			// synced perfectly can still sit below the fold. Measured 2026-08-19 —
			// asserting row visibility failed while the total went 218 -> 219, i.e.
			// the record HAD arrived. The total is the sort-independent statement
			// of "the till knows about it".
			// The footer reads "showing N of TOTAL" — take the LAST number, never a
			// digit-strip of both.
			const totalOf = (text: string | null): number => {
				const numbers = (text ?? '').match(/\d+/g);
				return numbers ? Number(numbers[numbers.length - 1]) : 0;
			};
			const before = totalOf(countBefore);
			await expect
				.poll(async () => totalOf(await countEl.textContent()), {
					message:
						'a product created on the server must reach the till without a manual sync (grid total must grow)',
					timeout: 420_000,
					intervals: [5_000],
				})
				.toBeGreaterThan(before);
		} finally {
			await deleteSearchProbe({
				request,
				storeUrl,
				authorization,
				collection: 'products',
				id: probe.id,
			});
		}
	});
});
