import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { Suspense } from '@wcpos/components/suspense';

import { Products } from './products';
import { TaxRatesProvider } from '../contexts/tax-rates';
import { useUISettings } from '../contexts/ui-settings';
import { QueryStateProvider } from '../../../query';

import type { QueryStateOf } from '../../../query';
import type { SortFieldsByCollection } from '../../../query/query-state-types';

const PRODUCTS_PAGE_SIZE = 10;
const PRODUCT_SORT_FIELDS = [
	'id',
	'name',
	'sku',
	'barcode',
	'price',
	'regular_price',
	'sale_price',
	'stock_quantity',
	'stock_status',
	'date_created_gmt',
	'date_modified_gmt',
] as const satisfies readonly SortFieldsByCollection['products'][];
const DEFAULT_PRODUCT_SORT = { field: 'name', direction: 'asc' } as const;

function isProductSortField(field: unknown): field is SortFieldsByCollection['products'] {
	return PRODUCT_SORT_FIELDS.some((sortField) => sortField === field);
}

function getInitialProductSort(
	sortBy: unknown,
	sortDirection: unknown
): QueryStateOf<'products'>['sort'] {
	if (!isProductSortField(sortBy)) return DEFAULT_PRODUCT_SORT;

	return { field: sortBy, direction: sortDirection === 'desc' ? 'desc' : 'asc' };
}

export function ProductsScreen() {
	const { uiSettings } = useUISettings('products');
	const initialSort = getInitialProductSort(uiSettings.sortBy, uiSettings.sortDirection);

	return (
		<QueryStateProvider
			collection="products"
			initialPageSize={PRODUCTS_PAGE_SIZE}
			initialSort={initialSort}
		>
			<ErrorBoundary>
				<Suspense>
					<TaxRatesProvider>
						<Suspense>
							<Products />
						</Suspense>
					</TaxRatesProvider>
				</Suspense>
			</ErrorBoundary>
		</QueryStateProvider>
	);
}
