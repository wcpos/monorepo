/**
 * J12 "Find a product": every way the products panel finds a product, written once as nine steps.
 *
 * - Start: register open, cart empty, Products in grid view, Browse by All, no search or filter.
 * - Edition: Free. Docs: `pos/product-panel/index.mdx` (wcpos/docs, `versioned_docs/version-2.x`).
 * - Soak-loopable: yes, the reset is step 9, which leaves the start state holding again.
 * - Source ruling: wcpos/roadmap#540.
 *
 * It writes no product: what it looks for is read once from the store (`readCatalogue`), and the
 * one cart line step 7's scan adds is voided in step 9, never saved. A store with no SKU long
 * enough to scan, or no variable product, is a declared gap: that step annotates and passes over.
 */
import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test';

import { getStoreUrl, openOrderSheet, setBrowseBy, setVariationsStyle } from '../fixtures';
import { resolveProbeOptions, type StoreAuthorization } from '../probe-credential';
import { ensureGridView, ensureTableView } from '../pos-view-mode';
import { probeGet } from '../search-probe';
import { unwrapWireBody } from '../wire-envelope';
import { openRegister, posLayout, showPhoneTab } from './open-register';

export const FIND_A_PRODUCT = {
	key: 'J12',
	title: 'Find a product',
	edition: 'free',
	docsPage: 'pos/product-panel/index.mdx',
	soakLoopable: true,
	resetStep: 9,
} as const;

export const STEPS = [
	{ number: 1, slug: 'see-products', title: 'See the products' },
	{ number: 2, slug: 'search', title: 'Search for a product' },
	{ number: 3, slug: 'filter-by-category', title: 'Filter by a category' },
	{ number: 4, slug: 'quick-filter', title: 'Use a quick filter' },
	{ number: 5, slug: 'tiles-and-rows', title: 'Switch between tiles and rows' },
	{ number: 6, slug: 'browse-by', title: 'Browse by category' },
	{ number: 7, slug: 'scan-a-barcode', title: 'Scan a barcode' },
	{ number: 8, slug: 'see-variations', title: 'See a product’s variations' },
	{ number: 9, slug: 'back-to-start', title: 'Back to the start' },
] as const;
export type JourneyStep = (typeof STEPS)[number];

/**
 * `'done'`: a step's own assertions passed. The rest fire inside a step, before it undoes its own
 * state: `'search-started'` (2) just before the name is typed, `'search-settled'` (2) the tile is
 * on screen, `'filter-on'` (3) the category filter applies, `'quick-filter-on'` (4) On sale reads
 * on, `'rows'` (5) the table view shows, `'browse-root'` (6) the term set shows, `'variations'` (8)
 * the variations pane has dealt.
 */
export type CheckpointId =
	| 'done'
	| 'search-started'
	| 'search-settled'
	| 'filter-on'
	| 'quick-filter-on'
	| 'rows'
	| 'browse-root'
	| 'variations';

/** The annotation type a declared gap is recorded under. */
export const DECLARED_GAP = 'declared-gap';

/**
 * Milliseconds between the keys of the wedge burst. The detector latches once the folded average
 * gap drops under the store's `barcode_scanning_avg_time_input_threshold` (24 ms by default) on
 * the second key; 5 ms leaves room for the browser's own per-key overhead.
 */
export const WEDGE_KEY_DELAY_MS = 5;

export interface FindAProductContext {
	page: Page;
	request: APIRequestContext;
	testInfo: ReturnType<typeof test.info>;
	storeAuthorization: () => StoreAuthorization | null;
	/** Observe-only: a checkpoint reads, waits or shoots; it never presses, types or navigates. */
	onCheckpoint?: (step: JourneyStep, id: CheckpointId) => Promise<void>;
}

type Named = { id: number; name: string };
/** What the walk looks for; a null is a declared gap. `thresholdMs`: the lowest outlet's. */
export interface Catalogue {
	searchTerm: Named;
	category: Named & { productId: number };
	scanCode: string | null;
	variableTerm: Named | null;
	thresholdMs: number;
}
export type ProductWalk = { layout: 'phone' | 'columns'; catalogue: Catalogue };

type WcProduct = {
	id: number;
	name: string;
	sku?: string;
	variations?: number[];
	meta_data?: { key: string; value: unknown }[];
};
type WcCategory = { id: number; name: string; slug: string; count: number };
type Options = { headers: Record<string, string>; params: Record<string, string> };

/** A name a cashier would type: no undecoded entity, never an E2E probe's (made mid-run). */
const typeable = (name: string) => name.trim().length > 2 && !/[&<>#;]|\bE2E\b/.test(name);

/** `wc/v3` lists what the POS hides: a product marked online only never reaches a till. */
const onPos = (product: WcProduct) =>
	!product.meta_data?.some(
		({ key, value }) => key === '_pos_visibility' && value === 'online_only'
	);

/** The outlets' scan settings, read the way `money-oracle-sale.ts` reads the store document. */
async function readScanSettings(request: APIRequestContext, storeUrl: string, options: Options) {
	const base = storeUrl.replace(/\/+$/, '');
	let response = await request.get(`${base}/wp-json/wcpos/v1/stores`, options);
	if (response.status() === 404) {
		const params = { ...options.params, rest_route: '/wcpos/v1/stores' };
		response = await request.get(`${base}/index.php`, { ...options, params });
	}
	if (!response.ok()) throw new Error(`wcpos/v1/stores read failed with ${response.status()}`);
	const stores = unwrapWireBody(await response.json()) as Record<string, unknown>[];
	const numbers = (key: string, fallback: number) =>
		stores.map((store) => Number(store[key] ?? fallback)).filter(Number.isFinite);
	const thresholdMs = Math.min(...numbers('barcode_scanning_avg_time_input_threshold', 24));
	return { thresholdMs, minChars: Math.max(...numbers('barcode_scanning_min_chars', 8)) };
}

/** Read what the walk looks for from the store, once. Nothing is hard-coded or created. */
export async function readCatalogue(
	request: APIRequestContext,
	storeAuthorization: () => StoreAuthorization | null
): Promise<Catalogue> {
	const storeUrl = getStoreUrl(test.info());
	const options = await resolveProbeOptions(request, storeUrl, storeAuthorization);
	const { thresholdMs, minChars } = await readScanSettings(
		request,
		storeUrl,
		await resolveProbeOptions(request, storeUrl, storeAuthorization, { route: '/wcpos/v1/orders' })
	);
	const read = async <T>(route: 'products' | 'products/categories', query: object) => {
		const params = { ...options.params, ...query } as Record<string, string>;
		const response = await probeGet(request, storeUrl, route, { ...options, params });
		if (!response.ok()) throw new Error(`${route} read failed with ${response.status()}`);
		const body = unwrapWireBody(await response.json());
		return { records: (Array.isArray(body) ? body : []) as T[] };
	};
	// Oldest first: the store's own catalogue, not records another run made this hour.
	const published = { status: 'publish', per_page: '50', orderby: 'date', order: 'asc' };
	// A name at most 4 products share, so its tile shows without scrolling. Counted, not read from
	// `x-wp-total`: a hostile tier strips that header (`hostile-headers.ts`).
	const distinct = async (candidates: WcProduct[]) => {
		for (const product of candidates.filter((candidate) => typeable(candidate.name)).slice(0, 8)) {
			const { records } = await read('products', { search: product.name, per_page: '5' });
			if (records.length > 0 && records.length <= 4) return product;
		}
		return undefined;
	};
	const sellable = { ...published, stock_status: 'instock' };
	const inStock = (
		await read<WcProduct>('products', { ...sellable, type: 'simple' })
	).records.filter(onPos);
	// The searched product carries the scan code when the store has one long enough (Woo keeps
	// SKUs unique, so a code found here names exactly one product).
	const scannable = inStock.filter((product) => (product.sku ?? '').length >= minChars);
	const searched = (await distinct(scannable)) ?? (await distinct(inStock));
	if (!searched) throw new Error('the store has no published, in-stock simple product to search');
	const scanCode = (scannable.find((p) => p.id === searched.id) ?? scannable[0])?.sku ?? null;
	// Smallest populated category first: its member shows without scrolling the filtered grid.
	const terms = { per_page: '100', hide_empty: 'true' };
	const { records: categories } = await read<WcCategory>('products/categories', terms);
	let category: Catalogue['category'] | undefined;
	for (const candidate of categories
		.filter((c) => c.count > 0 && c.slug !== 'uncategorized' && typeable(c.name))
		.sort((left, right) => left.count - right.count)
		.slice(0, 10)) {
		const query = { ...sellable, per_page: '10', category: `${candidate.id}` };
		const member = (await read<WcProduct>('products', query)).records.find(onPos);
		category = member && { id: candidate.id, name: candidate.name, productId: member.id };
		if (category) break;
	}
	if (!category) throw new Error('the store has no category holding a published, in-stock product');
	const variable = await read<WcProduct>('products', { ...published, type: 'variable' });
	const found = await distinct(
		variable.records.filter((p) => onPos(p) && (p.variations ?? []).length > 0)
	);
	return {
		searchTerm: { id: searched.id, name: searched.name },
		category,
		scanCode,
		variableTerm: found ? { id: found.id, name: found.name } : null,
		thresholdMs,
	};
}

async function journeyStep<T>(
	ctx: FindAProductContext,
	number: JourneyStep['number'],
	body: () => Promise<T>
): Promise<T> {
	const step = STEPS[number - 1];
	return test.step(`${step.number}. ${step.title}`, async () => {
		const result = await body();
		await ctx.onCheckpoint?.(step, 'done');
		return result;
	});
}

function declareGap(ctx: FindAProductContext, step: JourneyStep['number'], missing: string) {
	ctx.testInfo.annotations.push({ type: DECLARED_GAP, description: `step ${step}: ${missing}` });
}

/** The products search in whichever layout is on screen; a tile by id, simple or variable. */
const productsSearch = (page: Page): Locator =>
	page.getByTestId('screen-pos').getByTestId('search-products').filter({ visible: true });
const tileOf = (page: Page, id: number): Locator =>
	page.getByTestId(`product-tile-${id}`).or(page.getByTestId(`variable-product-tile-${id}`));
const cartLines = (page: Page) => page.getByTestId('cart-quantity-input');
/** Pages whose variations style step 8 changed, and what it found. */
const foundStyle = new WeakMap<Page, 'inline'>();

/** Run `body` with the cart on screen: its own tab on a phone, then back to Products. */
async function onCart<T>(page: Page, layout: ProductWalk['layout'], body: () => Promise<T>) {
	if (layout === 'phone') await showPhoneTab(page, 'cart');
	const result = await body();
	if (layout === 'phone') await showPhoneTab(page, 'products');
	return result;
}

/**
 * Put the panel on the products themselves. A device starts on Browse by Categories on demo,
 * and the walks need tiles on screen, so a browse root moves to All. The tile wait covers a
 * catalogue still arriving after a store switch.
 */
export async function showAllProducts(page: Page): Promise<void> {
	if ((await posLayout(page)) === 'phone') await showPhoneTab(page, 'products');
	const stage = page.getByTestId('pos-products-grid-scroller').or(page.getByTestId('browse-root'));
	await expect(stage.filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
	if (await page.getByTestId('browse-root').filter({ visible: true }).count()) {
		await setBrowseBy(page, 'all');
	}
	const tiles = page.getByTestId('product-tile').or(page.getByTestId('variable-product-tile'));
	await expect(tiles.filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
}

/** 1. See the products: the grid, its search, the filter bar and the panel's controls. */
export async function seeProducts(ctx: FindAProductContext): Promise<ProductWalk> {
	return journeyStep(ctx, 1, async () => {
		const { page } = ctx;
		await openRegister(page);
		const layout = await posLayout(page);
		if (layout === 'phone') await showPhoneTab(page, 'products');
		await ensureGridView(page);
		await showAllProducts(page);
		const pills = ['stock_status', 'featured', 'on_sale', 'categories'];
		const controls = ['pos-products-grid-scroller', 'view-mode-toggle', 'products-settings-button'];
		for (const testID of [...controls, ...pills.map((key) => `filter-pill-${key}`)]) {
			await expect(page.getByTestId(testID).filter({ visible: true }).first()).toBeVisible();
		}
		await expect(productsSearch(page)).toBeVisible({ timeout: 30_000 });
		return { layout, catalogue: await readCatalogue(ctx.request, ctx.storeAuthorization) };
	});
}

/** 2. Search: the product's tile shows, and clearing the search gives the grid back. */
export async function search(ctx: FindAProductContext, walk: ProductWalk): Promise<void> {
	await journeyStep(ctx, 2, async () => {
		const { page } = ctx;
		const searchTerm = walk.catalogue.searchTerm;
		await ctx.onCheckpoint?.(STEPS[1], 'search-started');
		await productsSearch(page).fill(searchTerm.name);
		await expect(tileOf(page, searchTerm.id)).toBeVisible({ timeout: 30_000 });
		await ctx.onCheckpoint?.(STEPS[1], 'search-settled');
		await productsSearch(page).clear();
		await expect(productsSearch(page)).toHaveValue('');
		await expect(page.getByTestId('pos-products-grid-scroller')).toBeVisible();
		await expect(page.getByTestId('product-tile').first()).toBeVisible({ timeout: 30_000 });
	});
}

/** 3. Filter by a category through its pill's picker, then remove the filter. */
export async function filterByCategory(ctx: FindAProductContext, walk: ProductWalk) {
	await journeyStep(ctx, 3, async () => {
		const { page } = ctx;
		const { category } = walk.catalogue;
		await page.getByTestId('filter-pill-categories').click();
		const picker = page.getByTestId('tree-combobox-search');
		await expect(picker).toBeVisible({ timeout: 15_000 });
		// Typed into the picker's own search to collapse the virtualized tree; chosen by testID.
		await picker.fill(category.name);
		await page.getByTestId(`tree-combobox-item-${category.id}`).click({ timeout: 15_000 });
		await page.keyboard.press('Escape');
		const remove = page.getByTestId('filter-pill-remove-categories');
		await expect(remove).toBeVisible({ timeout: 15_000 });
		await expect(tileOf(page, category.productId)).toBeVisible({ timeout: 45_000 });
		await ctx.onCheckpoint?.(STEPS[2], 'filter-on');
		await remove.click();
		await expect(remove).toHaveCount(0, { timeout: 15_000 });
	});
}

/** 4. A quick filter: the On sale pill reads on, then off. No count: a store may have no sale. */
export async function quickFilter(ctx: FindAProductContext): Promise<void> {
	await journeyStep(ctx, 4, async () => {
		const pill = ctx.page.getByTestId('filter-pill-on_sale');
		await expect(pill).toHaveAttribute('aria-pressed', 'false');
		await pill.click();
		await expect(pill).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 });
		await ctx.onCheckpoint?.(STEPS[3], 'quick-filter-on');
		await pill.click();
		await expect(pill).toHaveAttribute('aria-pressed', 'false', { timeout: 10_000 });
	});
}

/** 5. Tiles and rows: the table view, then the grid again. */
export async function tilesAndRows(ctx: FindAProductContext): Promise<void> {
	await journeyStep(ctx, 5, async () => {
		const { page } = ctx;
		await ensureTableView(page);
		await expect(page.getByTestId('data-table-scroller-products').first()).toBeVisible();
		await ctx.onCheckpoint?.(STEPS[4], 'rows');
		await ensureGridView(page);
		await expect(page.getByTestId('pos-products-grid-scroller')).toBeVisible();
	});
}

/** 6. Browse by categories opens on the term set; All gives the products back. */
export async function browseBy(ctx: FindAProductContext): Promise<void> {
	await journeyStep(ctx, 6, async () => {
		const { page } = ctx;
		await setBrowseBy(page, 'categories');
		await expect(page.getByTestId('browse-root').first()).toBeVisible({ timeout: 30_000 });
		await ctx.onCheckpoint?.(STEPS[5], 'browse-root');
		await setBrowseBy(page, 'all');
		await expect(page.getByTestId('browse-root')).toHaveCount(0, { timeout: 15_000 });
	});
}

/** 7. Scan a barcode: a keyboard-wedge burst of the SKU adds one line and leaves no search. */
export async function scanABarcode(ctx: FindAProductContext, walk: ProductWalk): Promise<void> {
	await journeyStep(ctx, 7, async () => {
		const { page } = ctx;
		const { scanCode, thresholdMs } = walk.catalogue;
		if (!scanCode) return declareGap(ctx, 7, 'no SKU as long as the scan minimum');
		const before = await onCart(page, walk.layout, () => cartLines(page).count());
		// The detector ignores keys aimed at a text field: the burst goes to the document.
		await productsSearch(page).blur();
		await page.keyboard.type(scanCode, { delay: WEDGE_KEY_DELAY_MS });
		await page.keyboard.press('Enter');
		const burst = `${scanCode.length} keys ${WEDGE_KEY_DELAY_MS} ms apart (threshold ${thresholdMs} ms)`;
		await onCart(page, walk.layout, () =>
			expect(cartLines(page), `${burst} adds a line`).toHaveCount(before + 1, { timeout: 20_000 })
		);
		await expect(productsSearch(page)).toHaveValue('');
	});
}

/** Drill-in for step 8, remembering what it found: E2E auth leaves pages on inline, not drill. */
async function useDrillStyle(page: Page): Promise<void> {
	await page.getByTestId('products-settings-button').click();
	const drill = page.getByTestId('products-variations-style-drill');
	const dialog = page.getByRole('dialog').filter({ has: drill });
	await expect(drill).toBeVisible({ timeout: 15_000 });
	if ((await drill.getAttribute('aria-checked')) !== 'true') {
		foundStyle.set(page, 'inline');
		await drill.click();
		await expect(drill).toHaveAttribute('aria-checked', 'true');
	}
	// Forced, as setVariationsStyle: the toast host intercepts pointer events after any toast.
	await dialog.getByTestId('ui-settings-close').click({ force: true });
	await expect(dialog).toBeHidden();
}

/** 8. See a variable product's variations in place, and the parent tile back. */
export async function seeVariations(ctx: FindAProductContext, walk: ProductWalk): Promise<void> {
	await journeyStep(ctx, 8, async () => {
		const { page } = ctx;
		const { variableTerm } = walk.catalogue;
		if (!variableTerm) return declareGap(ctx, 8, 'no published variable product with variations');
		await useDrillStyle(page);
		await productsSearch(page).fill(variableTerm.name);
		const tile = page
			.getByTestId('variable-product-tile')
			.filter({ has: page.getByTestId(`variable-product-tile-${variableTerm.id}`) });
		const pane = page.getByTestId('products-variations-pane');
		const variation = pane.getByTestId('variation-tile').first();
		// A drill-in keeps its search (`drill.search`): a tap the debounced search overtakes drops.
		await expect(async () => {
			if (!(await pane.isVisible())) await tile.click({ timeout: 10_000 });
			await expect(variation).toBeVisible({ timeout: 10_000 });
		}).toPass({ timeout: 60_000 });
		await expect(page.getByTestId('products-breadcrumb')).toBeVisible();
		// A dealt tile is "visible" while still transparent: let the deal land before going back.
		const opacity = () => variation.evaluate((n) => getComputedStyle(n.parentElement!).opacity);
		await expect.poll(opacity, { timeout: 15_000 }).toBe('1');
		await ctx.onCheckpoint?.(STEPS[7], 'variations');
		await pane.getByTestId('variations-parent-tile').click();
		await expect(pane).toBeHidden({ timeout: 15_000 });
		await productsSearch(page).clear();
	});
}

/**
 * Put back every setting the walk changes: search, filters, a drill-in, view mode, Browse by and
 * variations style. A no-op at the start state; the CI spec calls it in a `finally`.
 */
export async function restoreProductPanel(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
	if ((await posLayout(page)) === 'phone') await showPhoneTab(page, 'products');
	const visible = (testID: string) => page.getByTestId(testID).filter({ visible: true });
	const back = visible('variations-parent-tile');
	if (await back.count()) await back.first().click();
	if (await productsSearch(page).count()) await productsSearch(page).clear();
	const remove = visible('filter-pill-remove-categories');
	if (await remove.count()) await remove.click();
	const onSale = visible('filter-pill-on_sale').and(page.locator('[aria-pressed="true"]'));
	if (await onSale.count()) await onSale.click();
	if (await page.getByTestId('browse-root').count()) await setBrowseBy(page, 'all');
	await ensureGridView(page);
	const style = foundStyle.get(page);
	if (style) await setVariationsStyle(page, style);
	foundStyle.delete(page);
}

/** 9. Back to the start: the cart voided (as `pos-cart.spec.ts` does), every setting put back. */
export async function backToStart(ctx: FindAProductContext, walk: ProductWalk): Promise<void> {
	await journeyStep(ctx, 9, async () => {
		const { page } = ctx;
		await onCart(page, walk.layout, async () => {
			if ((await cartLines(page).count()) > 0) {
				await openOrderSheet(page);
				await page.getByTestId('void-button').click();
			}
			await expect(cartLines(page)).toHaveCount(0, { timeout: 15_000 });
		});
		await restoreProductPanel(page);
		await expect(productsSearch(page)).toHaveValue('');
		await expect(page.getByTestId('filter-pill-remove-categories')).toHaveCount(0);
		await expect(page.getByTestId('pos-products-grid-scroller')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('browse-root')).toHaveCount(0);
	});
}

/** The whole walk, steps 1 to 9, ending in the state it started in. */
export async function findAProduct(ctx: FindAProductContext): Promise<ProductWalk> {
	const walk = await seeProducts(ctx);
	await search(ctx, walk);
	await filterByCategory(ctx, walk);
	await quickFilter(ctx);
	await tilesAndRows(ctx);
	await browseBy(ctx);
	await scanABarcode(ctx, walk);
	await seeVariations(ctx, walk);
	await backToStart(ctx, walk);
	return walk;
}
