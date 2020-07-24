import React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, tap, debounceTime, catchError, distinctUntilChanged } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import Table from '../../../../components/table';
import useAppState from '../../../../hooks/use-app-state';
import Rows from './rows';

interface Props {
	columns: any;
	products: any;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 *
 */
const ProductsTable: React.FC<Props> = ({ columns, display, query, sort }) => {
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
				})
			),
		[query] as const
	);

	const products = useObservableState(products$, []);

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
					{({ getHeaderCellProps }) => {
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
				{({ item }) => {
					if (item.type === 'variable') {
						return <Rows.Variation variation={item} columns={columns} display={display} />;
					}
					return <Rows.Product product={item} columns={columns} display={display} />;
				}}
			</Table.Body>
		</Table>
	);
};

export default ProductsTable;
