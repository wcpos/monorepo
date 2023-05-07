import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useSnackbar from '@wcpos/components/src/snackbar';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import cells from './cells';
import Footer from './footer';
import ProductTableRow from './table-row';
import { t } from '../../../../lib/translations';
import EmptyTableRow from '../../components/empty-table-row';
import TextCell from '../../components/text-cell';
import useProducts from '../../contexts/products';
import usePushDocument from '../../contexts/use-push-document';
import { VariationsProvider } from '../../contexts/variations';

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
	const { query$, setQuery, data: products, nextPage } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const addSnackbar = useSnackbar();
	const pushDocument = usePushDocument();
	const columns = useObservableState(
		uiSettings.get$('columns'),
		uiSettings.get('columns')
	) as UISettingsColumn[];
	const [shownItems, setShownItems] = React.useState<Record<string, boolean>>({});

	/**
	 *
	 */
	const handleChange = React.useCallback(
		async (product: ProductDocument, data: Record<string, unknown>) => {
			try {
				const latest = product.getLatest();
				const doc = await latest.patch(data);
				const success = await pushDocument(doc);
				if (isRxDocument(success)) {
					addSnackbar({
						message: t('Product {id} saved', { _tags: 'core', id: success.id }),
					});
				}
			} catch (error) {
				log.error(error);
				addSnackbar({
					message: t('There was an error: {message}', { _tags: 'core', message: error.message }),
				});
			}
		},
		[addSnackbar, pushDocument]
	);

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index }) => {
			const Cell = get(cells, [item.type, column.key], cells.simple[column.key]);

			if (Cell) {
				return (
					<ErrorBoundary>
						<React.Suspense>
							<Cell item={item} column={column} index={index} onChange={handleChange} />
						</React.Suspense>
					</ErrorBoundary>
				);
			}

			return <TextCell item={item} column={column} />;
		},
		[]
	);

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
			cellRenderer,
			headerLabel: ({ column }) => uiSettings.getLabel(column.key),
			shownItems,
		};
	}, [columns, query.sortBy, query.sortDirection, cellRenderer, shownItems, setQuery, uiSettings]);

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
			data={products}
			footer={<Footer count={products.length} />}
			estimatedItemSize={150}
			extraData={context}
			renderItem={(props) => (
				<ErrorBoundary>
					<ProductTableRow {...props} />
				</ErrorBoundary>
			)}
			ListEmptyComponent={<EmptyTableRow message={t('No products found', { _tags: 'core' })} />}
			onViewableItemsChanged={handleViewableItemsChanged}
			viewabilityConfig={{
				viewAreaCoveragePercentThreshold: 50,
				minimumViewTime: 500,
			}}
		/>
	);
};

export default ProductsTable;
