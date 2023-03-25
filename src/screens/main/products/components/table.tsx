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
import { t } from '../../../../lib/translations';
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
	log.debug('render products table');

	/**
	 *
	 */
	const handleChange = React.useCallback(
		async (product: ProductDocument, data: Record<string, unknown>) => {
			try {
				const doc = await product.patch(data);
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
		};
	}, [columns, query.sortBy, query.sortDirection, cellRenderer, setQuery, uiSettings]);

	/**
	 *
	 */
	const renderItem = ({ item, index, extraData, target }: ListRenderItemInfo<ProductDocument>) => {
		if (item.type === 'variable') {
			return (
				<ErrorBoundary>
					<VariationsProvider parent={item} uiSettings={uiSettings}>
						<Table.Row item={item} index={index} extraData={extraData} target={target} />
					</VariationsProvider>
				</ErrorBoundary>
			);
		}
		return (
			<ErrorBoundary>
				<Table.Row item={item} index={index} extraData={extraData} target={target} />
			</ErrorBoundary>
		);
	};

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			data={products}
			footer={<Footer count={products.length} />}
			estimatedItemSize={150}
			extraData={context}
			renderItem={renderItem}
			// getItemType={(item) => item.type}
			// onEndReached={() => {
			// 	nextPage();
			// }}
		/>
	);
};

export default ProductsTable;
