import * as React from 'react';
import { useObservableState, useObservableSuspense } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import get from 'lodash/get';
import useProducts from '@wcpos/hooks/src/use-products';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Table, { TableContextProps } from '@wcpos/components/src/table';
import Footer from './footer';
import cells from './cells';

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
	 *
	 */
	const cellRenderer = React.useCallback(({ item, column, index }) => {
		const Cell = get(cells, [item.type, column.key]);
		return Cell ? <Cell item={item} column={column} index={index} /> : null;
	}, []);

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
	const tableContext = React.useMemo<TableContextProps<ProductDocument>>(() => {
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
	useWhyDidYouUpdate('ProductsTable', {
		t,
		query$,
		resource,
		setQuery,
		ui,
		data,
		columns,
		query,
		tableContext,
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
			context={tableContext}
		/>
	);
};

export default POSProductsTable;
