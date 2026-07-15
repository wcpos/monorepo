export type CollectionKey = keyof FiltersByCollection;

export type DateRangeFilter = { from: string; to: string };
export type VariationMatch = { id: number; name: string; option: string };

export interface FiltersByCollection {
	products: {
		categories: number[];
		tags: number[];
		brands: number[];
		featured?: boolean;
		on_sale?: boolean;
		stock_status?: string;
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
	variations: { attributeMatches: VariationMatch[] };
	customers: Record<never, never>;
	'tax-rates': Record<never, never>;
	logs: { level?: string[] };
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
		| 'code'
		| 'amount'
		| 'discount_type'
		| 'status'
		| 'usage_count'
		| 'date_expires_gmt'
		| DatedSort;
	variations: 'id' | 'name' | 'sku' | PriceSort | StockSort | DatedSort;
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
	setSort(field: SortFieldOf<C>, direction: 'asc' | 'desc'): void;
	extendLimit(): void;
};
