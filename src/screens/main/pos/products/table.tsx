import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservableSuspense } from 'observable-hooks';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import cells from './cells';
import Footer from './footer';
import { t } from '../../../../lib/translations';
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

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index }) => {
			const Cell = get(cells, [item.type, column.key], cells.simple[column.key]);

			if (Cell) {
				return (
					<React.Suspense fallback={<Text>loading cell...</Text>}>
						<Cell item={item} column={column} index={index} />
					</React.Suspense>
				);
			}

			if (item[column.key]) {
				return <Text>{String(item[column.key])}</Text>;
			}

			return null;
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
	const renderItem = React.useCallback(
		({ item, index, extraData, target }: ListRenderItemInfo<ProductDocument>) => {
			console.log(`render item ${item.id}`);
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
		},
		[uiSettings]
	);

	/**
	 *
	 */
	useWhyDidYouUpdate('ProductsTable', {
		t,
		query$,
		setQuery,
		uiSettings,
		data,
		columns,
		query,
		context,
	});

	/**
	 *
	 */
	return (
		<Table<ProductDocument>
			data={data}
			footer={<Footer count={data.length} />}
			estimatedItemSize={150}
			getItemType={(item) => item.type}
			renderItem={renderItem}
			extraData={context}
		/>
	);
};

export default POSProductsTable;
