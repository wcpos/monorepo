import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';

import Footer from './footer';
import ProductTableRow from './table-row';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
import TextCell from '../../components/text-cell';
import useProducts from '../../contexts/products';

import type { ListRenderItemInfo } from '@shopify/flash-list';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UISettingsColumn = import('../../contexts/ui-settings').UISettingsColumn;

interface ProductsTableProps {
	uiSettings: import('../../contexts/ui-settings').UISettingsDocument;
}

/**
 * NOTE: not sure if this is the best spot for replication, but we need acces to the query
 */
const ProductsTable = ({ uiSettings }: ProductsTableProps) => {
	const { query$, setQuery, resource, nextPage } = useProducts();
	const products = useObservableSuspense(resource);
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	// const [shownItems, setShownItems] = React.useState<Record<string, boolean>>({});

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
	// const handleViewableItemsChanged = React.useCallback(
	// 	({ viewableItems }) => {
	// 		setShownItems((prevShownItems) => {
	// 			const newShownItems: Record<string, boolean> = {};

	// 			viewableItems.forEach(({ item }) => {
	// 				if (!prevShownItems[item.uuid]) {
	// 					newShownItems[item.uuid] = true;
	// 				}
	// 			});

	// 			if (Object.keys(newShownItems).length > 0) {
	// 				return { ...prevShownItems, ...newShownItems };
	// 			} else {
	// 				return prevShownItems;
	// 			}
	// 		});
	// 	},
	// 	[] // Remove shownItems from the dependency array
	// );

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			// take first 10 items
			// data={products.slice(0, 10)}
			data={products}
			footer={<Footer count={products.length} />}
			estimatedItemSize={150}
			extraData={context}
			getItemType={(item) => item.type}
			renderItem={(props) => (
				<ErrorBoundary>
					<ProductTableRow {...props} />
				</ErrorBoundary>
			)}
			ListEmptyComponent={<EmptyTableRow message={t('No products found', { _tags: 'core' })} />}
			// onViewableItemsChanged={handleViewableItemsChanged}
			// viewabilityConfig={{
			// 	viewAreaCoveragePercentThreshold: 50,
			// 	minimumViewTime: 500,
			// }}
		/>
	);
};

export default ProductsTable;
