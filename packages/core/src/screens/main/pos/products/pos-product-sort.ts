import initialSettings from '../../contexts/ui-settings/initial-settings.json';
import { normalizeQuerySortField } from '../../../../query/query-state-translator';

import type { QueryStateOf, SortFieldsByCollection } from '../../../../query/query-state-types';

const POS_PRODUCT_SORT_FIELDS = [
	'name',
	'sku',
	'barcode',
	'type',
	'sortable_price',
	'date_created_gmt',
	'date_modified_gmt',
	'total_sales',
	'stock_quantity',
	'stock_status',
	'menu_order',
] as const satisfies readonly SortFieldsByCollection['products'][];

const isPOSProductSortField = (field: unknown): field is SortFieldsByCollection['products'] =>
	POS_PRODUCT_SORT_FIELDS.some((candidate) => candidate === field);

const DEFAULT_POS_PRODUCT_SORT: QueryStateOf<'products'>['sort'] = (() => {
	const { sortBy, sortDirection } = initialSettings['pos-products'];
	const field = normalizeQuerySortField('products', sortBy);
	if (!isPOSProductSortField(field)) {
		throw new Error(`initial-settings pos-products.sortBy "${sortBy}" is not a POS sort field`);
	}
	return { field, direction: sortDirection === 'desc' ? 'desc' : 'asc' };
})();

export function getPOSProductSort(
	sortBy: unknown,
	sortDirection: unknown
): QueryStateOf<'products'>['sort'] {
	const field = normalizeQuerySortField('products', sortBy);
	return isPOSProductSortField(field)
		? { field, direction: sortDirection === 'desc' ? 'desc' : 'asc' }
		: DEFAULT_POS_PRODUCT_SORT;
}
