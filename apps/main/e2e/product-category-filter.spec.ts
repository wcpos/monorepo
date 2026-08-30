import { type APIRequestContext, expect, type Page } from '@playwright/test';

import { LOADED_COUNT_READY, LOADED_COUNT_TEST_ID } from './catalogue-readiness';
import { getStoreUrl, authenticatedTest as test } from './fixtures';
import { resolveProbeOptions } from './probe-credential';
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

/**
 * How many populated categories to probe for a member before giving up. Bounded only
 * so a pathological store cannot turn discovery into hundreds of requests; every
 * populated category is eligible, most-populated first, so the bound is never the
 * reason a normal store finds nothing.
 */
const CATEGORY_PROBE_BUDGET = 25;
/** Pages of 100 categories to walk. A store past this is one this spec cannot reason about. */
const CATEGORY_PAGE_BUDGET = 20;
/** How many rendered tiles to resolve against the server when hunting a non-member. */
const NON_MEMBER_SAMPLE_LIMIT = 20;
/** wc/v3 rejects `per_page` above this, so it also bounds how many ids one probe may name. */
const WC_MAX_PER_PAGE = 100;
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
 * Every product category the store has, walked page by page.
 *
 * The WHOLE tree or nothing: a partial read misclassifies a parent whose children
 * fall on a later page as a leaf, and the spec would then pick a "non-member" out of
 * a child category that the picker's cascade legitimately keeps on screen.
 *
 * A failed read THROWS. The store declares this endpoint — a 401/403/500 is a broken
 * environment, and reporting that as a skip is how an auth regression turns CI green
 * with the behaviour untested (CLAUDE.md, E2E store-agnostic policy).
 */
async function fetchAllCategories(
	request: APIRequestContext,
	storeUrl: string,
	options: { headers: Record<string, string>; params: Record<string, string> }
): Promise<WcCategory[]> {
	const collected: WcCategory[] = [];
	for (let page = 1; page <= CATEGORY_PAGE_BUDGET; page += 1) {
		const response = await probeGet(request, storeUrl, 'products/categories', {
			...options,
			params: { ...options.params, per_page: '100', page: String(page) },
		});
		if (!response.ok()) {
			throw new Error(
				`products/categories page ${page} failed with ${response.status()} — the store serves this route, so a failed read is a broken environment, not a missing fixture`
			);
		}
		const batch = await readRecords<WcCategory>(response);
		collected.push(...batch);
		const totalPages = Number(response.headers()['x-wp-totalpages'] ?? '1');
		if (batch.length === 0 || !Number.isFinite(totalPages) || page >= totalPages) {
			return collected;
		}
	}
	throw new Error(
		`the store has more than ${CATEGORY_PAGE_BUDGET * 100} product categories; this spec needs the whole tree to tell a leaf from a parent`
	);
}

/**
 * Ask the store for a category that genuinely holds a published, in-stock product.
 *
 * Term counts alone are not trusted as the referent — a stale count would send the
 * spec after a category the products query cannot satisfy — so each candidate is
 * confirmed by the same products query the app issues, and the confirmed product
 * proves the category is a real test case.
 */
async function chooseCategory(
	request: APIRequestContext,
	storeUrl: string,
	options: { headers: Record<string, string>; params: Record<string, string> }
): Promise<CategoryChoiceResult> {
	const categories = await fetchAllCategories(request, storeUrl, options);
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
	// referent. Parents follow — the picker cascades to descendants and wc/v3's
	// tax_query includes children — they just make the set harder to talk about.
	// Within each group, most-populated first. A term COUNT does not promise a
	// published in-stock product, so every populated category stays a candidate
	// rather than the arbitrary top few.
	const byCountDesc = (left: WcCategory, right: WcCategory) => right.count - left.count;
	const leaves = populated.filter((category) => !childrenOf.has(category.id));
	const parents = populated.filter((category) => childrenOf.has(category.id));
	const candidates = [...leaves.sort(byCountDesc), ...parents.sort(byCountDesc)].slice(
		0,
		CATEGORY_PROBE_BUDGET
	);

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
		// Same policy as the category read: an erroring products query is a broken
		// store, not an empty category. Swallowing it here would skip the spec on
		// exactly the auth regression it should be loudest about.
		if (!products.ok()) {
			throw new Error(
				`products?category=${candidate.id} failed with ${products.status()} while looking for a member product`
			);
		}
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
		reason: `no published in-stock product in any of ${candidates.length} populated categories (of ${populated.length}) — term counts disagree with the products query`,
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
	if (ids.length > WC_MAX_PER_PAGE) {
		// One page or the intersection is a lie by omission: ids past the ceiling would
		// come back absent and read as "rendered but not in the category".
		throw new Error(
			`refusing to probe ${ids.length} ids in one request — wc/v3 caps per_page at ${WC_MAX_PER_PAGE}`
		);
	}
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

		// Wait for the grid FIRST, then borrow the app's credential. Both halves matter:
		// a rendering grid is proof the app is authenticating right now, and the probe
		// options are negotiated rather than assumed. Taking the captured credential on
		// trust made this spec report a stale-token 401 as a broken store (CI run
		// 32663366318, shard 4); see resolveProbeOptions for the two failure modes.
		await expect
			.poll(() => page.getByTestId(LOADED_COUNT_TEST_ID).textContent(), { timeout: 30_000 })
			.toMatch(LOADED_COUNT_READY);

		const options = await resolveProbeOptions(request, storeUrl, storeAuthorization);

		const chosen = await chooseCategory(request, storeUrl, options);
		if (!chosen.ok) {
			test.skip(true, chosen.reason);
			return;
		}
		const { category, selectedIds, member } = chosen.choice;

		const nonMember = await findNonMember(page, request, storeUrl, options, selectedIds);
		if (nonMember === null) {
			test.skip(
				true,
				`no rendered product sits outside "${category.name}" — this store cannot prove the filter EXCLUDES anything`
			);
			return;
		}
		const nonMemberTile = page.getByTestId(tileTestId(nonMember));
		await expect(nonMemberTile).toBeVisible();

		// The filtered window must reach the WIRE and come back OK — not just be
		// dispatched, and not just re-slice the resident rows. That is the regression
		// class this spec was added for (TEST-PLAN "Filtered browse"): a hydrated
		// catalogue can satisfy every local assertion while the server window 401s.
		//
		// The predicate requires `ok()` rather than asserting on the first matching
		// response, deliberately: a hostile proxy tier can 401 a header-carried token
		// so the app re-negotiates its transport and retries (wcpos-infra#72, always-on
		// at dev-free). That recovery is correct behaviour. What must not happen is
		// NO successful filtered window inside the budget.
		//
		// Armed before the click so the exchange cannot be missed.
		const filteredWindow = page.waitForResponse(
			(response) => {
				const url = new URL(response.url());
				// Tolerates both permalink styles: /wp-json/…/products and ?rest_route=/…/products.
				const addressesProducts =
					url.pathname.includes('/products') || url.search.includes('%2Fproducts');
				const wireCategory = url.searchParams.get('category');
				return (
					addressesProducts &&
					wireCategory !== null &&
					wireCategory.split(',').includes(String(category.id)) &&
					response.ok()
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
		// 1. A filtered window carrying the selected category reached the wire AND
		//    the store answered it successfully.
		const windowResponse = await filteredWindow;
		expect(
			windowResponse.status(),
			'the filtered product window did not come back OK'
		).toBeLessThan(400);
		// 2. The known non-member is gone — the half that makes this a filter and not
		//    a no-op that happened to leave the catalogue on screen.
		//
		//    Moved AHEAD of the count poll, and given the sync budget, because it is the
		//    first assertion here that a pre-filter grid cannot satisfy. The poll below
		//    reads as the wait for the filtered results and is not one: it asserts only
		//    that the loaded count is a positive integer, and the grid was ALREADY
		//    non-empty — `nonMemberTile` was asserted VISIBLE moments ago, off these very
		//    rows. So it passes on the pre-filter render, and the entire wait for the
		//    re-render fell to this line's DEFAULT 5s. As dev-next's catalogue grew, that
		//    stopped being enough and the spec began failing on every branch, here on
		//    some attempts and at step 4 on others (runs 32738423956, 32738568493,
		//    32738684283).
		await expect(nonMemberTile).not.toBeVisible({ timeout: FILTERED_GRID_TIMEOUT_MS });
		// 3. The grid is not empty. The RENDERED-row count on its own, never the
		//    "Showing X of Y" sentence, whose Y is the store-wide census and stays
		//    non-zero over an empty grid (#1336, #1345). Still worth asserting: the
		//    disappearance above cannot tell a working filter from one that emptied the
		//    grid completely.
		await expect
			.poll(() => page.getByTestId(LOADED_COUNT_TEST_ID).textContent(), {
				timeout: FILTERED_GRID_TIMEOUT_MS,
			})
			.toMatch(LOADED_COUNT_READY);
		// 4. Everything still rendered really is in that category, per the SERVER.
		//    Deliberately a set relation, not a named row: the grid is title-sorted and
		//    virtualized, so WHICH members are on screen is not the spec's business —
		//    that they are all members is. `member` is what proved the category
		//    non-empty during discovery; it need not be one of the rendered rows.
		//
		//    Polled, not sampled once. Two things put a non-member in this set without
		//    the filter being broken: a row still on screen from the transition above,
		//    and a product another run created, re-categorised or deleted between the
		//    render and the probe — dev-next is written to constantly, and a deleted
		//    product simply drops out of the membership answer. Both settle. A filter
		//    that does not filter never does, and still fails here once the budget is
		//    spent, naming the strays it kept rendering.
		let strays: number[] = [];
		let sampledRows = 0;
		await expect
			.poll(
				async () => {
					const rendered = (await renderedProductIds(page)).slice(0, WC_MAX_PER_PAGE);
					sampledRows = rendered.length;
					// Distinct from a clean grid: an empty grid proves nothing, and returning
					// 0 here would pass the assertion on it.
					if (rendered.length === 0) return -1;
					const members = await categoryMembersAmong(
						request,
						storeUrl,
						options,
						category.id,
						rendered
					);
					strays = rendered.filter((id) => !members.has(id));
					return strays.length;
				},
				{
					timeout: FILTERED_GRID_TIMEOUT_MS,
					// Each attempt costs one wc/v3 round trip, so back off rather than spin.
					intervals: [1_000, 2_000, 5_000],
					message: `the filtered grid kept rendering products the store does not put in "${category.name}" (discovery product ${member.id})`,
				}
			)
			.toBe(0);
		expect(
			sampledRows,
			`the filtered grid rendered no rows to check for "${category.name}"`
		).toBeGreaterThan(0);
		expect(
			strays,
			`the filtered grid rendered products the store does not put in "${category.name}" (discovery product ${member.id})`
		).toEqual([]);
	});
});
