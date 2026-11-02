import { expect, test } from './test';
import { storePickLocator } from './fixtures';

/**
 * Unit-style pin for the harness's store pick — a static page, no store.
 *
 * The connect screen holds TWO radio groups, in this order: the site's WordPress users (each
 * row a `role="radio"`, the selected one `aria-checked="true"`) and then the cashier's stores.
 * The users became a radio group on 2026-10-18 (#2703). The harness's default pick was "the
 * first radio inside any radiogroup", so from then on it pressed the cashier's own row: that
 * re-selects the user, which clears the store choice, and Open POS stayed disabled in every
 * `next`-lane shard and the shared setup (run 39233189694). The markup below is the connect
 * screen's shape as the built app rendered it against dev-next on 2026-10-19.
 */
const CONNECT_SCREEN = `
	<div role="radiogroup" aria-label="WordPress users">
		<div data-testid="wp-user-button" role="radio" aria-checked="true" tabindex="0">Demo Cashier</div>
	</div>
	<div role="radiogroup">
		<div data-testid="store-option-24128" role="button" tabindex="0">
			<button role="radio" aria-checked="false"></button><span>Birmingham</span>
		</div>
		<div data-testid="store-option-24129" role="button" tabindex="0">
			<button role="radio" aria-checked="false"></button><span>London</span>
		</div>
	</div>
	<button data-testid="open-pos-button" disabled>Open POS</button>
`;

/** The testID of the store row a locator lands in, or the element's own testID. */
async function landsIn(locator: ReturnType<typeof storePickLocator>) {
	return locator.evaluate(
		(node) =>
			node.closest('[data-testid^="store-option-"]')?.getAttribute('data-testid') ??
			node.getAttribute('data-testid')
	);
}

test.describe('storePickLocator', () => {
	test('the default pick is the first offered store, never the cashier row above it', async ({
		page,
	}) => {
		await page.setContent(CONNECT_SCREEN);
		expect(await landsIn(storePickLocator(page))).toBe('store-option-24128');
	});

	test('a requested store is picked by its WooCommerce id', async ({ page }) => {
		await page.setContent(CONNECT_SCREEN);
		expect(await landsIn(storePickLocator(page, 24129))).toBe('store-option-24129');
	});
});
