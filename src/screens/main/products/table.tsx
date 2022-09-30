import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import useProducts from '@wcpos/core/src/contexts/products';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table, { TableExtraDataProps, CellRenderer } from '@wcpos/components/src/table';
import Text from '@wcpos/components/src/text';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { VariationsProvider } from '@wcpos/core/src/contexts/variations';
import type { ListRenderItemInfo } from '@shopify/flash-list';
import Footer from './footer';
import cells from './cells';

type ProductDocument = import('@wcpos/database').ProductDocument;
type UIColumn = import('@wcpos/hooks/src/use-store').UIColumn;

interface ProductsTableProps {
	ui: import('@wcpos/hooks/src/use-store').UIDocument;
}

/**
 *
 */
const ProductsTable = ({ ui }: ProductsTableProps) => {
	const { t } = useTranslation();
	const { query$, setQuery, data: products } = useProducts();
	const query = useObservableState(query$, query$.getValue());
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
			return t(`products.column.label.${column.key}`);
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
		if (item.type === 'variable') {
			return (
				<ErrorBoundary>
					<VariationsProvider parent={item} ui={ui}>
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
	useWhyDidYouUpdate('Table', { products });

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
		/>
	);
};

export default ProductsTable;
