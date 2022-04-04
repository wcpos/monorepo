import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import orderBy from 'lodash/orderBy';
import useData from '@wcpos/common/src/hooks/use-collection-query';
import useQuery from '@wcpos/common/src/hooks/use-query';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Table from '@wcpos/common/src/components/table3';
import ErrorBoundary from '@wcpos/common/src/components/error-boundary';
import { SimpleProductRow, VariableProductRow } from './rows';
import Footer from './footer';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type ProductDocument = import('@wcpos/common/src/database').ProductDocument;
type ColumnProps = import('@wcpos/common/src/components/table3/table').ColumnProps<ProductDocument>;
type UIColumn = import('@wcpos/common/src/hooks/use-ui-resource').UIColumn;

interface POSProductsTableProps {
	ui: import('@wcpos/common/src/hooks/use-ui-resource').UIDocument;
}

/**
 *
 */
const POSProductsTable = ({ ui }: POSProductsTableProps) => {
	const { t } = useTranslation();
	const { data } = useData('products');
	const { query, setQuery } = useQuery();
	const columns = useObservableState(ui.get$('columns'), ui.get('columns')) as UIColumn[];

	/**
	 * - filter visible columns
	 * - translate column label
	 * - asssign cell renderer
	 */
	const visibleColumns = React.useMemo(() => {
		return columns
			.filter((column) => column.show)
			.map((column) => {
				// clone column and add label
				return {
					...column,
					label: t(`pos.products.column.label.${column.key}`),
				};
			});
	}, [columns, t]);

	/**
	 * in memory sort
	 */
	const sortedData = React.useMemo(() => {
		return orderBy(data, [query.sortBy], [query.sortDirection]);
	}, [data, query.sortBy, query.sortDirection]);

	/**
	 * handle sort
	 */
	const handleSort: Sort = React.useCallback(
		({ sortBy, sortDirection }) => {
			setQuery('sortBy', sortBy);
			setQuery('sortDirection', sortDirection);
		},
		[setQuery]
	);

	/**
	 *
	 */
	const rowRenderer = React.useCallback(
		(
			item,
			index
			// renderContext: TableRowRenderContext<T>,
		) => {
			let row;
			switch (item.type) {
				case 'variable':
					row = <VariableProductRow product={item} columns={visibleColumns} />;
					break;
				default:
					row = <SimpleProductRow product={item} columns={visibleColumns} />;
			}

			return row ? <ErrorBoundary>{row}</ErrorBoundary> : null;
		},
		[visibleColumns]
	);

	useWhyDidYouUpdate('ProductsTable', {
		data,
		columns,
		query,
		sortedData,
		visibleColumns,
		rowRenderer,
	});

	return (
		<Table<ProductDocument>
			columns={visibleColumns}
			data={sortedData}
			sort={handleSort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
			footer={<Footer count={data.length} />}
			rowRenderer={rowRenderer}
		/>
	);
};

export default POSProductsTable;
