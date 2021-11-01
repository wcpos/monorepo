import * as React from 'react';
import { useTranslation } from 'react-i18next';
import orderBy from 'lodash/orderBy';
import get from 'lodash/get';
import useData from '@wcpos/common/src/hooks/use-collection-query';
import useQuery from '@wcpos/common/src/hooks/use-query';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Table from '@wcpos/common/src/components/table3';
import cells from './cells';

type ColumnProps = import('@wcpos/common/src/components/table3/table').ColumnProps;
type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;

interface POSProductsTableProps {
	columns: ColumnProps[];
}

const POSProductsTable = ({ columns }: POSProductsTableProps) => {
	const { t } = useTranslation();
	const { data } = useData('products');
	const { query, setQuery } = useQuery();

	/** translate columns labels */
	const labelledColumns = React.useMemo(
		() =>
			columns.map((column) => {
				// clone column and add label
				return { ...column, label: t(`products.column.label.${column.key}`) };
			}),
		[columns, t]
	);

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

	useWhyDidYouUpdate('Table', { data });

	return (
		<Table
			columns={labelledColumns}
			data={sortedData}
			// sort={handleSort}
			// sortBy={query.sortBy}
			// sortDirection={query.sortDirection}
		>
			{(rowProps) => (
				<Table.Row {...rowProps}>
					{(cellProps) => {
						const { item, column, ...rest } = cellProps;
						const Cell = get(cells, column.key);
						if (Cell) {
							return (
								<Table.Row.Cell column={column} {...rest}>
									<Cell item={item} column={column} />
								</Table.Row.Cell>
							);
						}

						return <Table.Row.Cell {...cellProps} />;
					}}
				</Table.Row>
			)}
		</Table>
	);
};

export default POSProductsTable;
