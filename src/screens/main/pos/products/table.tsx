import * as React from 'react';

import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps } from '@wcpos/components/src/table';

import Footer from './footer';
import ProductTableRow from './table-row';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
import useProducts from '../../contexts/products';

import type { ListRenderItemInfo } from '@shopify/flash-list';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UISettingsColumn = import('../../contexts/ui-settings').UISettingsColumn;

interface POSProductsTableProps {
	uiSettings: import('../../contexts/ui-settings').UISettingsDocument;
}

/**
 *
 */
const POSProductsTable = ({ uiSettings }: POSProductsTableProps) => {
	const { query$, setQuery, resource, replicationState, loadNextPage } = useProducts();
	const { data, count, hasMore } = useObservableSuspense(resource);
	const loading = useObservableState(replicationState.active$, false);
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	// const [shownItems, setShownItems] = React.useState<Record<string, boolean>>({});
	// const shownItems = React.useRef<Record<string, boolean>>({});

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
			// shownItems,
		};
	}, [columns, query.sortBy, query.sortDirection, setQuery, uiSettings]);

	/**
	 *
	 */
	const onEndReached = React.useCallback(() => {
		if (hasMore) {
			loadNextPage();
		}
	}, [hasMore, loadNextPage]);

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			data={data}
			footer={<Footer count={count} />}
			estimatedItemSize={150}
			renderItem={(props) => (
				<ErrorBoundary>
					<ProductTableRow {...props} />
				</ErrorBoundary>
			)}
			extraData={context}
			ListEmptyComponent={<EmptyTableRow message={t('No products found', { _tags: 'core' })} />}
			onEndReached={onEndReached}
			loading={loading}
		/>
	);
};

export default POSProductsTable;
