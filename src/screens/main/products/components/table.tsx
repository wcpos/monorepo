import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps } from '@wcpos/components/src/table';

import Footer from './footer';
import SimpleProductTableRow from './rows/simple';
import VariableProductTableRow from './rows/variable';
import VariationsTableRow from './rows/variations';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
import useProducts from '../../contexts/products';
import useTotalCount from '../../hooks/use-total-count';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UISettingsColumn = import('../../contexts/ui-settings').UISettingsColumn;

interface ProductsTableProps {
	uiSettings: import('../../contexts/ui-settings').UISettingsDocument;
}

// Table Rows
const TABLE_ROW_COMPONENTS = {
	simple: SimpleProductTableRow,
	variable: VariableProductTableRow,
	variations: VariationsTableRow,
};

/**
 * NOTE: not sure if this is the best spot for replication, but we need acces to the query
 */
const ProductsTable = ({ uiSettings }: ProductsTableProps) => {
	const { query$, setQuery, resource, replicationState, loadNextPage, shownVariations$ } =
		useProducts();
	const { data, count, hasMore } = useObservableSuspense(resource);
	const shownVariations = useObservableState(shownVariations$, {});
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
	const productsAndVariations = React.useMemo(() => {
		const result = [];

		data.forEach((record) => {
			result.push(record);

			if (shownVariations[record.uuid]) {
				result.push({ type: 'variations', parent: record });
			}
		});

		return result;
	}, [data, shownVariations]);

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
			data={productsAndVariations}
			footer={<Footer count={count} total={total} loading={loading} />}
			estimatedItemSize={150}
			extraData={context}
			getItemType={(item) => item.type}
			renderItem={renderItem}
			ListEmptyComponent={<EmptyTableRow message={t('No products found', { _tags: 'core' })} />}
			onEndReached={onEndReached}
			loading={loading}
			nestedScrollEnabled={true}
		/>
	);
};

export default ProductsTable;
