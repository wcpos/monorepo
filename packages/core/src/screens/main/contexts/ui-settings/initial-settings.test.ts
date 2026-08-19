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
 * A column the cashier can click to sort declares a query-state sort field; the requirement
 * bridge turns that field into the browse window's `orderby` via `wooOrderbyFor(…)`. When the
 * field has no wire `orderby` the bridge simply omits it, and the window falls back to the
 * DEFAULT sort while the grid locally re-sorts that slice — the first N rows in the default
 * order, re-ordered under the chosen column's heading. Plausible-looking and silently not the
 * answer the cashier asked for.
 *
 * That divergence was real for sku/barcode/stock_quantity/stock_status until #999 extended
 * the wire grammar to the WCPOS plugin's orderby enum (the values the server plugin has
 * accepted since 2023-10-27, so 1.9 already depended on them). It was invisible because
 * NOTHING tied the two vocabularies together: `collection-map.test.ts` pins what the wire
 * can express and the ui-settings pin what the cashier can click, and neither test could see
 * a column that was clickable but unexpressible.
 *
 * These tests are that seam. Adding a sortable column with no `sort.wooOrderby` row in the
 * collection map now fails here instead of shipping as a silently wrong ordering.
 *
 * COVERAGE (2026-08-19): this used to pin the two PRODUCT grids only, which is how the
 * customers grid's `date_modified_gmt` reached production unexpressible. Every grid backed by
 * a browse window is covered now — products, orders and customers — so a third unmappable
 * column cannot appear silently.
 */
type ColumnSetting = { key: string; disableSort?: boolean };

type SortSeamGrid = {
	/** The grid's key in initial-settings.json. */
	grid: 'pos-products' | 'products' | 'orders' | 'reports-orders' | 'customers' | 'coupons';
	/** The collection whose wire vocabulary that grid's sorts must live inside. */
	collection: 'products' | 'orders' | 'customers' | 'coupons';
	/**
	 * Columns the cashier can click that the wire cannot express, served by sorting LOCAL
	 * residents. A local sort is a legitimate answer for such a column — what #947 forbids is a
	 * sort that SILENTLY returns the default window's ordering under another column's heading.
	 *
	 * Kept as an explicit allowlist rather than a skipped case so a NEW unexpressible sort
	 * cannot join one quietly — see the "exactly" assertion below.
	 */
	localOnlySorts: string[];
	/** Columns that are not sorts at all (row-selection affordances), excluded by name. */
	nonSortColumns?: string[];
};

/**
 * `type` (products): no `orderby` on any surface — neither core Woo's enum nor the WCPOS
 * plugin's extensions accept it, so 1.9 could not serve it either (it sent `orderby=type` and
 * Woo's REST enum validator rejected the request outright). PAUL'S RULING (2026-08-14): BOTH
 * product lists sort by type, locally.
 *
 * `date_modified_gmt` (customers): the customers read surface has no wire orderby for it —
 * `wc/v3/customers` does not offer one and the WCPOS proxy does not re-apply one. The demand
 * path still declares the window with the sort omitted (query-state-translator.ts), so the
 * rows are a real default-ordered slice rather than whatever the trickle happened to hold.
 */
const SORT_SEAM_GRIDS: SortSeamGrid[] = [
	{ grid: 'pos-products', collection: 'products', localOnlySorts: ['type'] },
	{ grid: 'products', collection: 'products', localOnlySorts: ['type'] },
	{ grid: 'orders', collection: 'orders', localOnlySorts: [] },
	// The reports grid's `select` is a row-selection checkbox, not a data column.
	{ grid: 'reports-orders', collection: 'orders', localOnlySorts: [], nonSortColumns: ['select'] },
	{ grid: 'customers', collection: 'customers', localOnlySorts: ['date_modified_gmt'] },
	// Coupons joined the wire vocabulary with #1347 part 2 (refresh lanes, not a
	// browse window). Every column ships `disableSort` today except the two hidden
	// date columns, so the per-column sweep is a tripwire for whichever column is
	// un-disabled first; the default-sort assertion is live immediately.
	{ grid: 'coupons', collection: 'coupons', localOnlySorts: [] },
];

const sortableColumns = ({ grid, nonSortColumns }: SortSeamGrid): string[] =>
	(initialSettings[grid].columns as unknown as ColumnSetting[])
		.filter((column) => !column.disableSort && !nonSortColumns?.includes(column.key))
		.map((column) => column.key);

/** The wire `orderby` a clicked column resolves to, mirroring the requirement bridge. */
const wireOrderbyForColumn = (
	collection: SortSeamGrid['collection'],
	columnId: string
): string | undefined =>
	wooOrderbyFor(collection, normalizeQuerySortField(collection, columnId) ?? columnId);

describe.each(SORT_SEAM_GRIDS)('$grid sortable columns reach the browse window (#947)', (entry) => {
	const unexpressible = () =>
		sortableColumns(entry).filter(
			(columnId) => wireOrderbyForColumn(entry.collection, columnId) === undefined
		);

	it('gives every cashier-clickable sort a wire orderby', () => {
		expect(unexpressible().filter((columnId) => !entry.localOnlySorts.includes(columnId))).toEqual(
			[]
		);
	});

	it('holds the local-only sorts to exactly the documented allowlist', () => {
		expect(unexpressible()).toEqual(
			entry.localOnlySorts.filter((columnId) => sortableColumns(entry).includes(columnId))
		);
	});

	it('expresses its own default sort on the wire', () => {
		expect(
			wireOrderbyForColumn(entry.collection, initialSettings[entry.grid].sortBy)
		).toBeDefined();
	});
});

// Paul's ruling 2026-08-14. The Products screen used to carry `disableSort` here while the
// POS grid did not; both lists now offer the sort, served locally.
describe.each(['pos-products', 'products'] as const)('%s type sort', (grid) => {
	it('offers the type sort on both product lists', () => {
		expect(sortableColumns({ grid, collection: 'products', localOnlySorts: ['type'] })).toContain(
			'type'
		);
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
