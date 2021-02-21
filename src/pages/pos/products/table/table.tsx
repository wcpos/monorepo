import * as React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import Table from '../../../../components/table';
import useAppState from '../../../../hooks/use-app-state';
import Row from './rows';

type ColumnProps = import('../../../../components/table/types').ColumnProps;
type Sort = import('../../../../components/table/types').Sort;
type SortDirection = import('../../../../components/table/types').SortDirection;
type GetHeaderCellPropsFunction = import('../../../../components/table/header-row').GetHeaderCellPropsFunction;

interface Props {
	columns: any;
	display: any;
	query: any;
	sort: Sort;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 *
 */
const ProductsTable = ({ columns, display, query, sort }: Props) => {
	const { t } = useTranslation();
	const [{ storeDB }] = useAppState();

	const products$ = useObservable(
		// A stream of React elements!
		(inputs$) =>
			inputs$.pipe(
				distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([q]) => {
					const regexp = new RegExp(escape(q.search), 'i');
					const RxQuery = storeDB.collections.products
						.find({
							selector: {
								name: { $regex: regexp },
							},
						})
						.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query] as const
	);

	const products = useObservableState(products$, []) as any[];

	return (
		<Table
			columns={columns}
			data={products}
			sort={sort}
			sortBy={query.sortBy}
			sortDirection={query.sortDirection}
		>
			<Table.Header>
				<Table.HeaderRow columns={columns}>
					{({ getHeaderCellProps }: { getHeaderCellProps: GetHeaderCellPropsFunction }) => {
						const { column } = getHeaderCellProps();
						return (
							<Table.HeaderRow.HeaderCell {...getHeaderCellProps()}>
								{t(`products.column.label.${column.key}`)}
							</Table.HeaderRow.HeaderCell>
						);
					}}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>
				{({ item }: { item: any }) => <Row product={item} columns={columns} display={display} />}
			</Table.Body>
		</Table>
	);
};

export default ProductsTable;
