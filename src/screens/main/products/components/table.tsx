import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableContextProps } from '@wcpos/components/src/table';

import SimpleProductTableRow from './rows/simple';
import VariableProductTableRow from './rows/variable';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
import { useProducts } from '../../contexts/products';
import useTotalCount from '../../hooks/use-total-count';
import Footer from '../footer';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UISettingsColumn = import('../../contexts/ui-settings').UISettingsColumn;

interface ProductsTableProps {
	uiSettings: import('../../contexts/ui-settings').UISettingsDocument;
}

// Table Rows
const TABLE_ROW_COMPONENTS = {
	simple: SimpleProductTableRow,
	variable: VariableProductTableRow,
};

/**
 * NOTE: not sure if this is the best spot for replication, but we need acces to the query
 */
const ProductsTable = ({ query, uiSettings }: ProductsTableProps) => {
	const data = useObservableSuspense(query.resource);
	// const { query, paginatedResource, replicationState, loadNextPage } = useProducts();
	// const { data, count, hasMore } = useObservableSuspense(paginatedResource);
	// const loading = useObservableState(replicationState.active$, false);
	// const total = useTotalCount('products', replicationState);
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const { sortBy, sortDirection } = useObservableState(query.state$, query.currentState);

	/**
	 *
	 */
	const context = React.useMemo<TableContextProps<ProductDocument>>(() => {
		return {
			columns: columns.filter((column) => column.show),
			sort: ({ sortBy, sortDirection }) => query.sort(sortBy, sortDirection),
			sortBy,
			sortDirection,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
		};
	}, [columns, sortBy, sortDirection, query, uiSettings]);

	/**
	 *
	 */
	// const onEndReached = React.useCallback(() => {
	// 	if (hasMore) {
	// 		loadNextPage();
	// 	} else if (!loading && total > count) {
	// 		replicationState.start({ fetchRemoteIDs: false });
	// 	}
	// }, [count, hasMore, loadNextPage, loading, replicationState, total]);

	/**
	 *
	 */
	const renderItem = React.useCallback((props) => {
		let Component = TABLE_ROW_COMPONENTS[props.item.type];

		// If we still didn't find a component, use SimpleProductTableRow as a fallback
		// eg: Grouped products
		if (!Component) {
			Component = SimpleProductTableRow;
		}

		return (
			<ErrorBoundary>
				<Component {...props} />
			</ErrorBoundary>
		);
	}, []);

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			data={data}
			// footer={<Footer count={count} total={total} loading={loading} />}
			estimatedItemSize={150}
			context={context}
			getItemType={(item) => item.type}
			renderItem={renderItem}
			ListEmptyComponent={<EmptyTableRow message={t('No products found', { _tags: 'core' })} />}
			// onEndReached={onEndReached}
			// loading={loading}
			nestedScrollEnabled={true}
		/>
	);
};

export default ProductsTable;
