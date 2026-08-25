import { randomUUID } from 'crypto';

import { expect, type Page } from '@playwright/test';

import { becomesVisible, getStoreUrl, authenticatedTest as test } from './fixtures';
import { createSearchProbe, deleteSearchProbe, searchAndWaitForServer } from './search-probe';

/**
 * THE PICKER PAGES (#1553).
 *
 * `useSearchSelect` used to compute a FIXED window of 50 rows and no combobox passed
 * `onEndReached` to its list, so the cart's customer picker ended at row 50 on a
 * 5,000-customer store — the rest were unreachable except by typing. The customer picker had
 * infinite scroll before the ADR-0024 migration; the fluent `loadMore()` it called was deleted
 * with the surface it belonged to and the paging was never re-wired onto the new binding.
 *
 * Unit coverage pins the wiring (the handler exists, the guard extends once per full page).
 * What it CANNOT see is the thing that actually broke for the cashier: a real virtualizer, in a
 * real popover, fed by a real store, handing back a second page when you scroll to the bottom.
 *
 * Store-agnostic: the spec creates a uniquely searchable two-page fixture and asserts those
 * exact customer ids can be reached by scrolling, independent of the store's existing data.
 */

/** Mirrors SEARCH_SELECT_PAGE_SIZE in packages/core/src/query/query-bindings.ts. */
const PAGE_SIZE = 50;

/** Scroll rounds to spend. Two full pages is the claim; this leaves room to reach them. */
const MAX_SCROLL_ROUNDS = 40;

/** Rounds with no new row before the list is declared exhausted. */
const ROUNDS_WITHOUT_GROWTH_UNTIL_END = 10;

/** Every customer row currently rendered by the virtualizer, guest sentinel excluded. */
async function renderedCustomerIds(page: Page): Promise<string[]> {
	const ids = await page
		.getByTestId(/^customer-select-option-/)
		.evaluateAll((elements) =>
			elements.map((element) => element.getAttribute('data-testid') ?? '')
		);
	return ids
		.map((id) => id.replace('customer-select-option-', ''))
		.filter((id) => id !== '' && id !== 'guest');
}

test.describe('POS customer picker', () => {
	test('reaches past the first page as the list scrolls', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const authorization = storeAuthorization();
		const searchToken = `e2e-paging-${randomUUID()}`;
		const results = await Promise.all(
			Array.from({ length: PAGE_SIZE + 1 }, (_, index) =>
				createSearchProbe({
					request,
					storeUrl,
					authorization,
					collection: 'customers',
					workerIndex: testInfo.workerIndex,
					token: `${searchToken}-${index}`,
					customerData: { first_name: searchToken, last_name: String(index) },
				})
			)
		);
		const probes = results.flatMap((result) => (result.ok ? [result.probe] : []));
		const expectedIds = new Set(probes.map(({ id }) => String(id)));

		try {
			const failed = results.find((result) => !result.ok);
			if (failed && !failed.ok) throw new Error(failed.reason);

			// The cart opens on the guest pill; its clear affordance swaps in the picker, and the
			// header opens the popover itself on the next frame. Clicking the trigger as well would
			// TOGGLE it shut, so the click is a fallback for the frame never arriving.
			await page.getByTestId('cart-customer-clear').click();

			const options = page.getByTestId(/^customer-select-option-/);
			if (!(await becomesVisible(options.first(), 10_000))) {
				await page.getByTestId('cart-customer-select').click();
			}
			const searchInput = page.getByRole('textbox').filter({ visible: true }).last();
			await searchAndWaitForServer(page, searchInput, 'customers', searchToken);
			await expect(options.first()).toBeVisible({ timeout: 30_000 });

			// Park the pointer over the list so wheel events land on ITS scroll container and not
			// on the page behind the popover.
			await options.first().hover();

			const seen = new Set<string>();
			let roundsWithoutGrowth = 0;

			for (let round = 0; round < MAX_SCROLL_ROUNDS; round += 1) {
				const before = seen.size;
				for (const id of await renderedCustomerIds(page)) seen.add(id);
				if ([...expectedIds].every((id) => seen.has(id))) break;

				roundsWithoutGrowth = seen.size > before ? 0 : roundsWithoutGrowth + 1;
				if (roundsWithoutGrowth >= ROUNDS_WITHOUT_GROWTH_UNTIL_END) break;

				await page.mouse.wheel(0, 600);
				// The extension is a wire fetch on a shared dev store; give it room to land.
				await page.waitForTimeout(750);
			}

			expect(
				[...expectedIds].filter((id) => seen.has(id)),
				`the picker did not reach every created customer; it found ${seen.size} distinct ids (#1553)`
			).toHaveLength(PAGE_SIZE + 1);
		} finally {
			await Promise.all(
				probes.map(({ collection, id }) =>
					deleteSearchProbe({ request, storeUrl, authorization, collection, id })
				)
			);
		}
	});
});
