import { type APIRequestContext, expect, type Page } from '@playwright/test';

import { LOADED_COUNT_READY, LOADED_COUNT_TEST_ID } from './catalogue-readiness';
import { getStoreUrl, storeRequestOptions, authenticatedTest as test } from './fixtures';
import { probeGet } from './search-probe';
import { unwrapWireBody } from './wire-envelope';

/**
 * The category filter pill against a real store (#941).
 *
 * WHY THIS SPEC EXISTS. On 2026-08-23 the POS showed "No products found" for the
 * Clothing category on dev-pro, and nothing in CI had an opinion about it. The
 * client was innocent — 201 of the store's 202 products sat in Uncategorized
 * because the CSV importer's default column map is built from TRANSLATED headers
 * and dev-pro runs es_ES, so the `Categories` column silently mapped to nothing.
 * Two things were missing: any coverage of the filter bar at all (no pill carried
 * a testID), and any signal that the store's catalogue had lost its taxonomy.
 *
 * So the spec is written to speak up in BOTH directions:
 *
 *  - It asks the SERVER which category holds products and asserts the UI agrees.
 *    A client-side regression — a filter that never reaches the wire, a promoted
 *    `categoryIds` column that stops being written, a selection that maps to the
 *    wrong ids — fails here.
 *  - A store where no category contains a single product SKIPS with that exact
 *    sentence. Per the store-agnostic policy a declared-missing environment is a
 *    skip, not a failure — but a named skip in the CI report is the signal that
 *    was absent while dev-pro's catalogue sat category-less for weeks.
 *
 * Store-agnostic throughout: no category, product or count is hard-coded. The
 * referents are discovered per run — the category from the store's own term
 * counts, the negative control from whatever the grid happens to be rendering.
 */

type WcCategory = { id: number; parent: number; name: string; count: number };
type WcProduct = { id: number; name: string; type: string; categories?: { id: number }[] };

/** How many populated categories to try before giving up on finding a member product. */
const CATEGORY_CANDIDATE_LIMIT = 5;
/** How many rendered tiles to resolve against the server when hunting a non-member. */
const NON_MEMBER_SAMPLE_LIMIT = 20;
/** The filtered window has to reach the wire and come back, so this is a sync budget. */
const FILTERED_GRID_TIMEOUT_MS = 45_000;

async function readRecords<T>(response: { json: () => Promise<unknown> }): Promise<T[]> {
	const body = unwrapWireBody(await response.json());
	return Array.isArray(body) ? (body as T[]) : [];
}

type CategoryChoice = {
	category: WcCategory;
	/** The category and everything under it — selecting a parent cascades to its children. */
	selectedIds: Set<number>;
	member: WcProduct;
};

type CategoryChoiceResult = { ok: true; choice: CategoryChoice } | { ok: false; reason: string };

/**
 * Ask the store for a category that genuinely holds a published, in-stock product.
 *
 * Term counts alone are not trusted as the referent — a stale count would send the
 * spec after a category the products query cannot satisfy — so each candidate is
 * confirmed by the same products query the app issues, and the confirmed product
 * becomes the row the UI must render.
 */
async function chooseCategory(
	request: APIRequestContext,
	storeUrl: string,
	options: { headers: Record<string, string>; params: Record<string, string> }
): Promise<CategoryChoiceResult> {
	const response = await probeGet(request, storeUrl, 'products/categories', {
		...options,
		params: { ...options.params, per_page: '100', orderby: 'count', order: 'desc' },
	});
	if (!response.ok()) {
		return { ok: false, reason: `products/categories read failed with ${response.status()}` };
	}
	const categories = await readRecords<WcCategory>(response);
	if (categories.length === 0) {
		return { ok: false, reason: 'the store declares no product categories' };
	}

	const childrenOf = new Map<number, WcCategory[]>();
	for (const category of categories) {
		if (!category.parent) continue;
		childrenOf.set(category.parent, [...(childrenOf.get(category.parent) ?? []), category]);
	}
	const descendantsOf = (id: number): Set<number> => {
		const collected = new Set<number>([id]);
		const queue = [id];
		while (queue.length > 0) {
			for (const child of childrenOf.get(queue.shift()!) ?? []) {
				if (collected.has(child.id)) continue;
				collected.add(child.id);
				queue.push(child.id);
			}
		}
		return collected;
	};

	const populated = categories.filter((category) => category.count > 0);
	if (populated.length === 0) {
		return {
			ok: false,
			reason: `no product category on this store contains any product (${categories.length} categories, every term count zero)`,
		};
	}
	// Leaves first: a leaf's selection is exactly one id, so the assertion names one
	// referent. Parents work too — the picker cascades to descendants and wc/v3's
	// tax_query includes children — they just make the set harder to talk about.
	const leaves = populated.filter((category) => !childrenOf.has(category.id));
	const candidates = (leaves.length > 0 ? leaves : populated).slice(0, CATEGORY_CANDIDATE_LIMIT);

	for (const candidate of candidates) {
		const products = await probeGet(request, storeUrl, 'products', {
			...options,
			params: {
				...options.params,
				per_page: '1',
				status: 'publish',
				stock_status: 'instock',
				category: String(candidate.id),
			},
		});
		if (!products.ok()) continue;
		const [member] = await readRecords<WcProduct>(products);
		if (member) {
			return {
				ok: true,
				choice: { category: candidate, selectedIds: descendantsOf(candidate.id), member },
			};
		}
	}
	return {
		ok: false,
		reason: `no published in-stock product in the ${candidates.length} most-populated categories (term counts disagree with the products query)`,
	};
}

/** The id-bearing tile testID for a product, by wc/v3 type. */
function tileTestId(product: WcProduct): string {
	return product.type === 'variable'
		? `variable-product-tile-${product.id}`
		: `product-tile-${product.id}`;
}

/**
 * Which of `ids` the store says are in the category — the intersection, asked for
 * in one request. Used to check the rendered grid against the server rather than
 * against a remembered catalogue.
 */
async function categoryMembersAmong(
	request: APIRequestContext,
	storeUrl: string,
	options: { headers: Record<string, string>; params: Record<string, string> },
	categoryId: number,
	ids: number[]
): Promise<Set<number>> {
	if (ids.length === 0) return new Set();
	const response = await probeGet(request, storeUrl, 'products', {
		...options,
		params: {
			...options.params,
			include: ids.join(','),
			category: String(categoryId),
			per_page: String(ids.length),
			status: 'publish',
		},
	});
	if (!response.ok()) {
		throw new Error(`products?include=…&category=${categoryId} failed with ${response.status()}`);
	}
	return new Set((await readRecords<WcProduct>(response)).map((product) => product.id));
}

/** Every product id the grid is currently rendering, read off the id-bearing tile testIDs. */
async function renderedProductIds(page: Page): Promise<number[]> {
	const testIds = await page
		.locator('[data-testid^="product-tile-"], [data-testid^="variable-product-tile-"]')
		.evaluateAll((elements) =>
			elements.map((element) => element.getAttribute('data-testid') ?? '')
		);
	return testIds
		.map((testId) => Number(testId.replace(/^(?:variable-)?product-tile-/, '')))
		.filter((id) => Number.isSafeInteger(id) && id > 0);
}

/**
 * A product the grid is showing that the SERVER says is outside the selection —
 * the negative control. Taken from the rendered rows so the "it disappeared"
 * assertion cannot pass vacuously on a row that was never there.
 */
async function findNonMember(
	page: Page,
	request: APIRequestContext,
	storeUrl: string,
	options: { headers: Record<string, string>; params: Record<string, string> },
	selectedIds: Set<number>
): Promise<WcProduct | null> {
	const rendered = (await renderedProductIds(page)).slice(0, NON_MEMBER_SAMPLE_LIMIT);
	if (rendered.length === 0) return null;
	const response = await probeGet(request, storeUrl, 'products', {
		...options,
		params: {
			...options.params,
			include: rendered.join(','),
			per_page: String(rendered.length),
			status: 'publish',
		},
	});
	if (!response.ok()) return null;
	const products = await readRecords<WcProduct>(response);
	return (
		products.find(
			(product) =>
				Array.isArray(product.categories) &&
				!product.categories.some((category) => selectedIds.has(category.id))
		) ?? null
	);
}

test.describe('Product category filter', () => {
	test('shows the products the store puts in a category, and hides the rest', async ({
		posPage: page,
		request,
		storeAuthorization,
	}, testInfo) => {
		const storeUrl = getStoreUrl(testInfo);
		const options = storeRequestOptions(storeAuthorization());

		const chosen = await chooseCategory(request, storeUrl, options);
		test.skip(!chosen.ok, chosen.ok ? '' : chosen.reason);
		const { category, selectedIds, member } = (chosen as { ok: true; choice: CategoryChoice })
			.choice;

		// The grid must be rendering something before the filter means anything.
		await expect
			.poll(() => page.getByTestId(LOADED_COUNT_TEST_ID).textContent(), { timeout: 30_000 })
			.toMatch(LOADED_COUNT_READY);

		const nonMember = await findNonMember(page, request, storeUrl, options, selectedIds);
		test.skip(
			nonMember === null,
			`no rendered product sits outside "${category.name}" — this store cannot prove the filter EXCLUDES anything`
		);
		const nonMemberTile = page.getByTestId(tileTestId(nonMember!));
		await expect(nonMemberTile).toBeVisible();

		// The filtered window must reach the WIRE, not just re-slice the resident rows —
		// the regression class this spec was added for (TEST-PLAN "Filtered browse").
		// Armed before the click so the request cannot be missed.
		const filteredWindowRequest = page.waitForRequest(
			(wireRequest) => {
				const url = new URL(wireRequest.url());
				// Tolerates both permalink styles: /wp-json/…/products and ?rest_route=/…/products.
				const addressesProducts =
					url.pathname.includes('/products') || url.search.includes('%2Fproducts');
				const wireCategory = url.searchParams.get('category');
				return (
					addressesProducts &&
					wireCategory !== null &&
					wireCategory.split(',').includes(String(category.id))
				);
			},
			{ timeout: FILTERED_GRID_TIMEOUT_MS }
		);

		// --- Apply the filter through the pill, addressing everything by testID. ---
		await page.getByTestId('filter-pill-categories').click();
		const search = page.getByTestId('tree-combobox-search');
		await expect(search).toBeVisible({ timeout: 15_000 });
		// Typed into the picker's OWN search box to collapse the virtualized tree down
		// to a handful of rows — the selection itself is still made by testID, never by
		// matching rendered text. The name goes in exactly as the wire served it:
		// labels keep their HTML entities until render, and a decoded string matches nothing.
		await search.fill(category.name);
		const option = page.getByTestId(`tree-combobox-item-${category.id}`);
		await expect(option).toBeVisible({ timeout: 15_000 });
		await option.click();
		await page.keyboard.press('Escape');

		// The pill is active — its remove control only exists once a filter is set.
		await expect(page.getByTestId('filter-pill-remove-categories')).toBeVisible({
			timeout: 15_000,
		});

		// --- What the filtered grid must show. ---
		// 1. The window reached the wire carrying the selected category.
		await filteredWindowRequest;
		// 2. The grid is not empty. The RENDERED-row count on its own, never the
		//    "Showing X of Y" sentence, whose Y is the store-wide census and stays
		//    non-zero over an empty grid (#1336, #1345).
		await expect
			.poll(() => page.getByTestId(LOADED_COUNT_TEST_ID).textContent(), {
				timeout: FILTERED_GRID_TIMEOUT_MS,
			})
			.toMatch(LOADED_COUNT_READY);
		// 3. The known non-member is gone — the half that makes this a filter and not
		//    a no-op that happened to leave the catalogue on screen.
		await expect(nonMemberTile).not.toBeVisible();
		// 4. Everything still rendered really is in that category, per the SERVER.
		//    Deliberately a set relation, not a named row: the grid is title-sorted and
		//    virtualized, so WHICH members are on screen is not the spec's business —
		//    that they are all members is. `member` is what proved the category
		//    non-empty during discovery; it need not be one of the rendered rows.
		const rendered = await renderedProductIds(page);
		expect(rendered.length).toBeGreaterThan(0);
		const members = await categoryMembersAmong(request, storeUrl, options, category.id, rendered);
		expect(
			rendered.filter((id) => !members.has(id)),
			`the filtered grid rendered products the store does not put in "${category.name}" (discovery product ${member.id})`
		).toEqual([]);
	});
});
