import * as React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import { from, of, combineLatest, zip, Observable } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import orderBy from 'lodash/orderBy';
import Table from '@wcpos/common/src/components/table';
import Text from '@wcpos/common/src/components/text';
import TextInput from '@wcpos/common/src/components/textinput';
import Button from '@wcpos/common/src/components/button';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import LineItem from './rows/line-item';
import FeeLine from './rows/fee-line';
import ShippingLine from './rows/shipping-line';
import TableSettings from './actions';

type ColumnProps = import('@wcpos/common/src/components/table/types').ColumnProps;
type Sort = import('@wcpos/common/src/components/table/types').Sort;
type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
type GetHeaderCellPropsFunction =
	import('@wcpos/common/src/components/table/header-row').GetHeaderCellPropsFunction;
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type LineItemDocument = import('@wcpos/common/src/database').LineItemDocument;
type FeeLineDocument = import('@wcpos/common/src/database').FeeLineDocument;
type ShippingLineDocument = import('@wcpos/common/src/database').ShippingLineDocument;

interface ICartTableProps {
	columns: ColumnProps[];
	items: any;
	query: any;
	onSort: Sort;
	ui: any;
}

const CartTable = ({ columns, items, query, onSort, ui }: ICartTableProps) => {
	const { t } = useTranslation();

	// const items$ = useObservable(
	// 	(inputs$) =>
	// 		inputs$.pipe(
	// 			// @ts-ignore
	// 			switchMap(([o, q]) => o.getCart$(q))
	// 		),
	// 	[order, query]
	// ) as Observable<any[]>;

	// const items = useObservableState(items$, []);

	useWhyDidYouUpdate('CartTable', { columns, items, query, onSort, ui });

	return (
		<Table
			columns={columns}
			data={items}
			sort={onSort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
		>
			<Table.Header>
				<Table.Header.Row columns={columns}>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.Header.Row.Cell {...getHeaderCellProps()}>
								{column.key === 'actions' ? (
									<TableSettings columns={columns} ui={ui} />
								) : (
									t(`cart.column.label.${column.key}`)
								)}
							</Table.Header.Row.Cell>
						);
					}}
				</Table.Header.Row>
			</Table.Header>
			<Table.Body>
				{({ item }: { item: any }): React.ReactElement | null => {
					switch (item.collection.name) {
						case 'line_items':
							return <LineItem item={item} columns={columns} />;
						case 'fee_lines':
							return <FeeLine fee={item} columns={columns} />;
						case 'shipping_lines':
							return <ShippingLine shipping={item} columns={columns} />;
						default:
							return null;
					}
				}}
			</Table.Body>
		</Table>
	);
};

export default CartTable;
