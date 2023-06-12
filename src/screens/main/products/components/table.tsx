import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps } from '@wcpos/components/src/table';

import Footer from './footer';
import ProductTableRow from './table-row';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
import useProducts from '../../contexts/products';
import useTotalCount from '../../hooks/use-total-count';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UISettingsColumn = import('../../contexts/ui-settings').UISettingsColumn;

interface ProductsTableProps {
	uiSettings: import('../../contexts/ui-settings').UISettingsDocument;
}

/**
 * NOTE: not sure if this is the best spot for replication, but we need acces to the query
 */
const ProductsTable = ({ uiSettings }: ProductsTableProps) => {
	const { query$, setQuery, resource, replicationState, loadNextPage } = useProducts();
	const { data, count, hasMore } = useObservableSuspense(resource);
	const loading = useObservableState(replicationState.active$, false);
	const total = useTotalCount('products', replicationState);
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];

	/**
	 *
	 */
	const context = React.useMemo<TableExtraDataProps<ProductDocument>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => {
				setQuery('sortBy', sortBy);
				setQuery('sortDirection', sortDirection);
			},
			sortBy: query.sortBy,
			sortDirection: query.sortDirection,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
		};
	}, [columns, query.sortBy, query.sortDirection, setQuery, uiSettings]);

	/**
	 *
	 */
	const onEndReached = React.useCallback(() => {
		if (hasMore) {
			loadNextPage();
		} else if (!loading && total > count) {
			replicationState.start({ fetchRemoteIDs: false });
		}
	}, [count, hasMore, loadNextPage, loading, replicationState, total]);

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			data={data}
			footer={<Footer count={count} total={total} loading={loading} />}
			estimatedItemSize={150}
			extraData={context}
			getItemType={(item) => item.type}
			renderItem={(props) => (
				<ErrorBoundary>
					<ProductTableRow {...props} />
				</ErrorBoundary>
			)}
			ListEmptyComponent={<EmptyTableRow message={t('No products found', { _tags: 'core' })} />}
			onEndReached={onEndReached}
			loading={loading}
		/>
	);
};

export default ProductsTable;
