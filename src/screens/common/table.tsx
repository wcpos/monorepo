import * as React from 'react';
import { Observable } from 'rxjs';
import { useObservableState } from 'observable-hooks';
import { useTranslation } from 'react-i18next';
import _flatten from 'lodash/flatten';
import _orderBy from 'lodash/orderBy';
import Table from '@wcpos/common/src/components/table';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Row, { CellsProp, ItemProp, ColumnProps } from './row';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;

interface CommonTableProps {
	collection: any;
	columns: ColumnProps[];
	data$: Observable<ItemProp[]>;
	setQuery: any;
	sortBy: string;
	sortDirection: SortDirection;
	cells: CellsProp;
}

type GetHeaderCellPropsFunction =
	import('@wcpos/common/src/components/table/header-row').GetHeaderCellPropsFunction;

/**
 *
 */
const CommonTable = ({
	collection,
	columns,
	data$,
	setQuery,
	sortBy: _sortBy,
	sortDirection: _sortDirection,
	cells,
}: CommonTableProps) => {
	const { t } = useTranslation();
	const data = useObservableState(data$, []);
	// const syncState = React.useRef<number[]>([]);

	const handleSort: Sort = React.useCallback(
		({ sortBy, sortDirection }) => {
			// @ts-ignore
			setQuery((prev) => ({ ...prev, sortBy, sortDirection }));
		},
		[setQuery]
	);

	/**
	 * maybe in memory sort
	 */
	const maybeSortedData = React.useMemo(() => {
		const indexes = _flatten(collection.schema.indexes);
		if (!indexes.includes(_sortBy)) {
			return _orderBy(data, [_sortBy], [_sortDirection]);
		}
		return data;
	}, [_sortBy, _sortDirection, collection.schema.indexes, data]);

	/**
	 *
	 */
	const getItemLayout = React.useCallback(
		(d, index) => ({ length: 100, offset: 100 * index, index }),
		[]
	);

	useWhyDidYouUpdate('Common Table', {
		collection,
		columns,
		data,
		maybeSortedData,
		setQuery,
		_sortBy,
		_sortDirection,
		cells,
		// syncingCustomers,
		t,
	});

	return (
		<Table
			columns={columns}
			data={maybeSortedData}
			sort={handleSort}
			sortBy={_sortBy}
			sortDirection={_sortDirection}
			// // @ts-ignore
			// onViewableItemsChanged={handleVieweableItemsChanged}
			// @ts-ignore
			getItemLayout={getItemLayout}
		>
			<Table.Header>
				<Table.Header.Row>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.Header.Row.Cell {...getHeaderCellProps()}>
								{t(`${collection.name}.column.label.${column.key}`)}
							</Table.Header.Row.Cell>
						);
					}}
				</Table.Header.Row>
			</Table.Header>
			<Table.Body>
				{({ item }: { item: any }) => (
					<Row item={item} columns={columns} cells={cells} setQuery={setQuery} />
				)}
			</Table.Body>
		</Table>
	);
};

export default React.memo(CommonTable);
