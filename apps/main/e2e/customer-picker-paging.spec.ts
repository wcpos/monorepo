import { expect, type Page } from '@playwright/test';

import { becomesVisible, authenticatedTest as test } from './fixtures';

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
 * Store-agnostic: the assertion is "more than one page of DISTINCT customers can be reached by
 * scrolling", never a name, an id, or an absolute count. A store with less than a full first
 * page cannot demonstrate paging at all — that is a declared-missing environment, so it skips.
 *
 * The skip has to EARN itself, though, or it is just a silent green wearing a reason. Coming up
 * short has two causes that look identical at the end of the loop: the store really holds fewer
 * than a page of customers, or rows were still arriving when the spec ran out of patience. Only
 * the first is skippable, so the spec proves it — the list must have been scrolled to a stable
 * end, its own scroller reporting the bottom with nothing new arriving. Short of that proof it
 * FAILS, because a coverage hole that reports itself as "environment" is the failure mode this
 * repo keeps re-learning. Exactly one page (50) is never skippable: that is the bug's signature.
 *
 * WHY THIS ONE DOES NOT CREATE ITS OWN FIXTURE. Create-and-find is the house pattern and it is
 * the right default, but a page is 50 rows: forcing an extension by construction means creating
 * 51 customers per run, per project, per retry. That was tried on this branch and measured —
 * dev-free answered 401 on customer creation, dev-pro created them and then answered 403 on
 * DELETE, stranding 153 users (51 x 3 retries) from a single run for a human to clean up by
 * hand. The `e2e-product-writer` identity can create a customer and cannot remove one, so the
 * cost is unbounded and permanent, and the specs would fail on the free store regardless.
 *
 * The read-only form costs nothing, passes on both stores today (18.7s free / 13.4s pro), and
 * degrades honestly on a store too small to demonstrate the behavior. If the picker's page size
 * ever drops far enough that seeding is cheap, revisit; do not re-seed 51 users to remove a
 * skip that names exactly why it fired.
 */

/** Mirrors SEARCH_SELECT_PAGE_SIZE in packages/core/src/query/query-bindings.ts. */
const PAGE_SIZE = 50;

/** Scroll rounds to spend. Two full pages is the claim; this leaves room to reach them. */
const MAX_SCROLL_ROUNDS = 40;

/** 5s rounds spent waiting for the first synced customer row to render. */
const CUSTOMER_ARRIVAL_ROUNDS = 12;

/** How close to the bottom still counts as the end, in px — the virtualizer's own tolerance. */
const END_TOLERANCE_PX = 5;

/** Rounds with no new row AND no more to scroll before the list is declared exhausted. */
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

/**
 * Whether the picker's own scroller is at its bottom. Walks up from a row to the first
 * scrolling ancestor INSIDE the popover; if nothing there scrolls, every row the picker holds
 * is already on screen, which is the end by definition.
 */
async function listIsScrolledToEnd(page: Page): Promise<boolean> {
	return page
		.getByTestId(/^customer-select-option-/)
		.first()
		.evaluate((element, tolerance) => {
			const stop = element.closest('[data-radix-popper-content-wrapper]');
			let node = element.parentElement;
			while (node && node !== stop) {
				if (node.scrollHeight > node.clientHeight) {
					return node.scrollHeight - (node.scrollTop + node.clientHeight) <= tolerance;
				}
				node = node.parentElement;
			}
			return true;
		}, END_TOLERANCE_PX);
}

test.describe('POS customer picker', () => {
	test('reaches past the first page as the list scrolls', async ({ posPage: page }) => {
		// The cart opens on the guest pill; its clear affordance swaps in the picker, and the
		// header opens the popover itself on the next frame. Clicking the trigger as well would
		// TOGGLE it shut, so the click is a fallback for the frame never arriving.
		await page.getByTestId('cart-customer-clear').click();

		const options = page.getByTestId(/^customer-select-option-/);
		if (!(await becomesVisible(options.first(), 10_000))) {
			await page.getByTestId('cart-customer-select').click();
		}
		await expect(options.first()).toBeVisible({ timeout: 30_000 });

		// The guest sentinel renders immediately; the store's own customers arrive with the
		// first sync of the picker's window (measured ~10s on dev-free). Waiting for a real
		// row separates "this store has no customers" from "they had not landed yet" — the
		// second would otherwise skip as the first and cover nothing.
		for (let wait = 0; wait < CUSTOMER_ARRIVAL_ROUNDS; wait += 1) {
			if ((await renderedCustomerIds(page)).length > 0) break;
			await page.waitForTimeout(5_000);
		}

		// Park the pointer over the list so wheel events land on ITS scroll container and not
		// on the page behind the popover.
		await options.first().hover();

		const seen = new Set<string>();
		let roundsWithoutGrowth = 0;
		let listExhausted = false;

		for (let round = 0; round < MAX_SCROLL_ROUNDS; round += 1) {
			const before = seen.size;
			for (const id of await renderedCustomerIds(page)) seen.add(id);
			if (seen.size > PAGE_SIZE) break;

			roundsWithoutGrowth = seen.size > before ? 0 : roundsWithoutGrowth + 1;
			if (roundsWithoutGrowth >= ROUNDS_WITHOUT_GROWTH_UNTIL_END) {
				listExhausted = await listIsScrolledToEnd(page);
				if (listExhausted) break;
			}

			await page.mouse.wheel(0, 600);
			// The extension is a wire fetch on a shared dev store; give it room to land.
			await page.waitForTimeout(750);
		}

		if (seen.size < PAGE_SIZE) {
			expect(
				listExhausted,
				`the picker showed ${seen.size} distinct customers and the list was never scrolled to a stable end — rows may still have been arriving, so this cannot be told apart from a store that simply has fewer customers. Failing rather than skipping: an unproven skip is a coverage hole that reports itself as "environment".`
			).toBe(true);
			test.skip(
				true,
				`store scope holds ${seen.size} customers, fewer than one ${PAGE_SIZE}-row page — a page extension cannot be demonstrated here`
			);
		}

		expect(
			seen.size,
			`the picker stopped at ${seen.size} distinct customers; a page is ${PAGE_SIZE}, so the window never grew (#1553)`
		).toBeGreaterThan(PAGE_SIZE);
	});
});
