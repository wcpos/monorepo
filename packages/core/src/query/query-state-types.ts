export type CollectionKey = keyof FiltersByCollection;

export type DateRangeFilter = { from: string; to: string };
export type VariationMatch = { id: number; name: string; option: string };

/**
 * The Logs ledger's tappable LEVEL-pill filter (map #1136, A1.5): strict
 * display-kind match — the list shows exactly the rows whose LEVEL pill was
 * tapped. Kinds are derived (action = actor row, sync = category domain), so
 * the selector semantics live in the translator, not the UI.
 */
export type LogKindFilter = 'error' | 'warn' | 'action' | 'sync' | 'info' | 'debug';

export interface FiltersByCollection {
	products: {
		categories: number[];
		tags: number[];
		brands: number[];
		featured?: boolean;
		on_sale?: boolean;
		stock_status?: string;
		status?: string;
	};
	orders: {
		status?: string;
		customer_id?: number;
		cashier?: string | number;
		store?: string | number;
		dateRange?: DateRangeFilter;
	};
	coupons: {
		discount_type?: string;
		status?: string;
		dateRange?: DateRangeFilter;
	};
	'products/categories': Record<never, never>;
	'products/brands': Record<never, never>;
	'products/tags': Record<never, never>;
	variations: { attributeMatches: VariationMatch[]; status?: string };
	customers: Record<never, never>;
	'tax-rates': Record<never, never>;
	logs: { level?: string[]; category_prefix?: string; has_actor?: boolean; kind?: LogKindFilter };
}

type DatedSort = 'date_created_gmt' | 'date_modified_gmt';
type PriceSort = 'price' | 'regular_price' | 'sale_price';
type StockSort = 'stock_quantity' | 'stock_status';

export interface SortFieldsByCollection {
	products:
		| 'id'
		| 'name'
		| 'sku'
		| 'barcode'
		| 'sortable_price'
		| 'total_sales'
		| 'menu_order'
		// The one product sort with no wire `orderby` on any surface (#947, Paul's ruling
		// 2026-08-14: both product lists sort by type). It sorts local residents only, which
		// is what 1.9 did too — Woo's REST enum rejected `orderby=type` outright.
		| 'type'
		| PriceSort
		| StockSort
		| DatedSort;
	orders:
		| 'status'
		| 'number'
		| 'customer_id'
		| 'total'
		| 'date_completed_gmt'
		| 'date_paid_gmt'
		| 'payment_method'
		| DatedSort;
	coupons:
		'code' | 'amount' | 'discount_type' | 'status' | 'usage_count' | 'date_expires_gmt' | DatedSort;
	'products/categories': 'id' | 'name';
	'products/brands': 'id' | 'name';
	'products/tags': 'id' | 'name';
	variations: 'id' | 'name' | 'sku' | 'menu_order' | PriceSort | StockSort | DatedSort;
	customers: 'id' | 'first_name' | 'last_name' | 'email' | 'role' | 'username' | DatedSort;
	'tax-rates': 'id' | 'name' | 'country' | 'state' | 'priority' | 'rate' | 'class' | 'order';
	logs: 'timestamp' | 'level' | 'code';
}

export type FiltersOf<C extends CollectionKey> = FiltersByCollection[C];
export type SortFieldOf<C extends CollectionKey> = SortFieldsByCollection[C];
export type QueryStateOf<C extends CollectionKey> = {
	search: string;
	filters: FiltersOf<C>;
	sort: { field: SortFieldOf<C>; direction: 'asc' | 'desc' };
	limit: number;
};

export type QueryStateActions<C extends CollectionKey> = {
	setSearch(term: string): void;
	clearSearch(): void;
	setFilter<F extends keyof FiltersOf<C>>(field: F, value: FiltersOf<C>[F]): void;
	clearFilter(field: keyof FiltersOf<C>): void;
	resetFilters(): void;
	/** Set (or, with undefined, remove) a filter in both the live state and the resetFilters baseline. */
	rebaseFilter<F extends keyof FiltersOf<C>>(field: F, value: FiltersOf<C>[F] | undefined): void;
	setSort(field: SortFieldOf<C>, direction: 'asc' | 'desc'): void;
	extendLimit(): void;
};
