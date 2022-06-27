import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import useProducts from '@wcpos/hooks/src/use-products';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table from '@wcpos/components/src/table';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import { SimpleProductRow, VariableProductRow } from './rows';
import Footer from './footer';

type Sort = import('@wcpos/components/src/table/table').Sort;
type ProductDocument = import('@wcpos/database').ProductDocument;
type UIColumn = import('@wcpos/hooks/src/use-ui-resource').UIColumn;

interface POSProductsTableProps {
	ui: import('@wcpos/hooks/src/use-ui-resource').UIDocument;
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
					row = <VariableProductRow product={item} columns={visibleColumns} itemIndex={index} />;
					break;
				default:
					row = <SimpleProductRow product={item} columns={visibleColumns} itemIndex={index} />;
			}

			return row ? <ErrorBoundary>{row}</ErrorBoundary> : null;
		},
		[visibleColumns]
	);

	useWhyDidYouUpdate('ProductsTable', {
		data,
		columns,
		query,
		visibleColumns,
		rowRenderer,
	});

	return (
		<Table<ProductDocument>
			columns={visibleColumns}
			data={data}
			sort={handleSort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
			footer={<Footer count={data.length} />}
			rowRenderer={rowRenderer}
		/>
	);
};

export default POSProductsTable;
