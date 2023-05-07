import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';

import Footer from './footer';
import ProductTableRow from './table-row';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
import useProducts from '../../contexts/products';
import { VariationsProvider } from '../../contexts/variations';

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
	const { query$, setQuery, data } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const [shownItems, setShownItems] = React.useState<Record<string, boolean>>({});
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
			shownItems,
		};
	}, [columns, query.sortBy, query.sortDirection, setQuery, uiSettings, shownItems]);

	/**
	 *
	 */
	const handleViewableItemsChanged = React.useCallback(
		({ viewableItems }) => {
			setShownItems((prevShownItems) => {
				const newShownItems: Record<string, boolean> = {};

				viewableItems.forEach(({ item }) => {
					if (!prevShownItems[item.uuid]) {
						newShownItems[item.uuid] = true;
					}
				});

				if (Object.keys(newShownItems).length > 0) {
					return { ...prevShownItems, ...newShownItems };
				} else {
					return prevShownItems;
				}
			});
		},
		[] // Remove shownItems from the dependency array
	);

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			data={data}
			footer={<Footer count={data.length} />}
			estimatedItemSize={150}
			// getItemType={(item) => (shownItems[item.uuid] ? 'shown' : 'hidden')}
			renderItem={(props) => (
				<ErrorBoundary>
					<ProductTableRow {...props} />
				</ErrorBoundary>
			)}
			extraData={context}
			ListEmptyComponent={<EmptyTableRow message={t('No products found', { _tags: 'core' })} />}
			onViewableItemsChanged={handleViewableItemsChanged}
			viewabilityConfig={{
				viewAreaCoveragePercentThreshold: 50,
				minimumViewTime: 500,
			}}
		/>
	);
};

export default POSProductsTable;
