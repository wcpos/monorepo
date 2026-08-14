import { wooOrderbyFor } from '@wcpos/query/collection-map';

import initialSettings from './initial-settings.json';
import { normalizeQuerySortField } from '../../../../query/query-state-translator';

describe('pos-products initial settings', () => {
	it('defaults the browse sort to the 1.9 catalog order — menu_order asc (#810)', () => {
		expect(initialSettings['pos-products'].sortBy).toBe('menu_order');
		expect(initialSettings['pos-products'].sortDirection).toBe('asc');
	});
});

/**
 * #947 — THE UI'S SORT VOCABULARY MUST NOT OUTGROW THE WIRE'S.
 *
 * A product column the cashier can click to sort declares a query-state sort field; the
 * requirement bridge turns that field into the browse window's `orderby` via
 * `wooOrderbyFor('products', …)`. When the field has no wire `orderby` the bridge simply
 * omits it, and the window falls back to the DEFAULT sort (menu_order asc) while the grid
 * locally re-sorts that slice — the first N rows by catalog order, re-ordered by the chosen
 * column. Plausible-looking and silently not the answer the cashier asked for.
 *
 * That divergence was real for sku/barcode/stock_quantity/stock_status until #999 extended
 * the wire grammar to the WCPOS plugin's orderby enum (the values the server plugin has
 * accepted since 2023-10-27, so 1.9 already depended on them). It was invisible because
 * NOTHING tied the two vocabularies together: `collection-map.test.ts` pins what the wire
 * can express and the ui-settings pin what the cashier can click, and neither test could see
 * a column that was clickable but unexpressible.
 *
 * These tests are that seam. Adding a sortable product column with no `sort.wooOrderby` row
 * in the collection map now fails here instead of shipping as a silently wrong ordering.
 */
type ColumnSetting = { key: string; disableSort?: boolean };

const PRODUCT_GRIDS = ['pos-products', 'products'] as const;

/**
 * The one product sort with no `orderby` on any surface — neither core Woo's enum nor the
 * WCPOS plugin's extensions accept `type`, so 1.9 could not serve it either (it sent
 * `orderby=type` and Woo's REST enum validator rejected the request outright). It sorts
 * LOCAL residents, which is exactly what 1.9 ended up doing.
 *
 * PAUL'S RULING (2026-08-14): BOTH product lists sort by type. The POS grid always could;
 * the Products screen carried a `disableSort` inherited from 1.9 and now does too. A local
 * sort is a legitimate answer for a column the wire cannot express — what #947 forbids is a
 * sort that SILENTLY returns the default window's ordering under another column's heading.
 *
 * Kept as an explicit allowlist rather than a skipped case so a SECOND unexpressible sort
 * cannot join it quietly — see the "exactly" assertion below.
 */
const LOCAL_ONLY_PRODUCT_SORTS = ['type'];

const sortableColumns = (grid: (typeof PRODUCT_GRIDS)[number]): string[] =>
	(initialSettings[grid].columns as unknown as ColumnSetting[])
		.filter((column) => !column.disableSort)
		.map((column) => column.key);

/** The wire `orderby` a clicked column resolves to, mirroring the requirement bridge. */
const wireOrderbyForColumn = (columnId: string): string | undefined =>
	wooOrderbyFor('products', normalizeQuerySortField('products', columnId) ?? columnId);

describe.each(PRODUCT_GRIDS)('%s sortable columns reach the browse window (#947)', (grid) => {
	it('gives every cashier-clickable sort a wire orderby', () => {
		const unexpressible = sortableColumns(grid).filter(
			(columnId) =>
				!LOCAL_ONLY_PRODUCT_SORTS.includes(columnId) && wireOrderbyForColumn(columnId) === undefined
		);

		expect(unexpressible).toEqual([]);
	});

	it('holds the local-only sorts to exactly the documented allowlist', () => {
		const localOnly = sortableColumns(grid).filter(
			(columnId) => wireOrderbyForColumn(columnId) === undefined
		);

		expect(localOnly).toEqual(
			LOCAL_ONLY_PRODUCT_SORTS.filter((columnId) => sortableColumns(grid).includes(columnId))
		);
	});

	it('expresses its own default sort on the wire', () => {
		expect(wireOrderbyForColumn(initialSettings[grid].sortBy)).toBeDefined();
	});

	// Paul's ruling 2026-08-14. The Products screen used to carry `disableSort` here while the
	// POS grid did not; both lists now offer the sort, served locally.
	it('offers the type sort on both product lists', () => {
		expect(sortableColumns(grid)).toContain('type');
	});
});

describe('pos-cart initial settings', () => {
	it('includes an image column that is hidden by default', () => {
		expect(initialSettings['pos-cart'].columns).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: 'image',
					show: false,
				}),
			])
		);
	});
});
