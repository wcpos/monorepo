import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import useProducts from '@wcpos/hooks/src/use-products';
import { ProductVariationsProvider } from '@wcpos/hooks/src/use-product-variations';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Footer from './footer';
import cells from './cells';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UIColumn = import('@wcpos/hooks/src/use-store').UIColumn;

interface POSProductsTableProps {
	ui: import('@wcpos/hooks/src/use-store').UIDocument;
}

/**
 *
 */
const POSProductsTable = ({ ui }: POSProductsTableProps) => {
	const { t } = useTranslation();
	const { query$, resource, setQuery } = useProducts();
	const query = useObservableState(query$, query$.getValue());
	const data = useObservableSuspense(resource);
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];

	/**
	 *
	 */
	const cellRenderer = React.useCallback<CellRenderer<ProductDocument>>(
		({ item, column, index }) => {
			const Cell = get(cells, [item.type, column.key], cells.simple[column.key]);

			if (Cell) {
				return <Cell item={item} column={column} index={index} />;
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
	const headerLabel = React.useCallback(
		({ column }) => {
			return t(`pos.products.column.label.${column.key}`);
		},
		[t]
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
			headerLabel,
		};
	}, [columns, query.sortBy, query.sortDirection, setQuery, cellRenderer, headerLabel]);

	/**
	 *
	 */
	const renderItem = ({ item, index, extraData, target }: ListRenderItemInfo<ProductDocument>) => {
		console.log(`render item ${item.id}`);
		if (item.type === 'variable') {
			return (
				<ErrorBoundary>
					<ProductVariationsProvider parent={item} ui={ui}>
						<Table.Row item={item} index={index} extraData={extraData} target={target} />
					</ProductVariationsProvider>
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
	useWhyDidYouUpdate('ProductsTable', {
		t,
		query$,
		resource,
		setQuery,
		ui,
		data,
		columns,
		query,
		context,
		headerLabel,
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
