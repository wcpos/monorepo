import React from 'react';
import { useObservable, useObservableState } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, tap, debounceTime } from 'rxjs/operators';
import { useTranslation } from 'react-i18next';
import Table from '../../../components/table';
import Text from '../../../components/text';
import Actions from './cells/actions';
import useAppState from '../../../hooks/use-app-state';

interface Props {
	columns: any;
	products: any;
}

/**
 *
 */
const ProductsTable: React.FC<Props> = ({ columns, search, sort }) => {
	const { t } = useTranslation();
	const [{ store }] = useAppState();

	const products$ = useObservable(
		// A stream of React elements!
		(inputs$) =>
			inputs$.pipe(
				// distinctUntilChanged((a, b) => a[0] === b[0]),
				debounceTime(150),
				switchMap(([val]) =>
					from(store.db).pipe(
						switchMap((db) => {
							const regexp = new RegExp(val, 'i');
							return db.collections.products.find({
								selector: {
									name: { $regex: regexp },
								},
							}).$;
						})
					)
				)
			),
		[search] as const
	);

	const products = useObservableState(products$, []);

	const renderCell = ({ getCellProps }) => {
		const { cellData, column, rowData } = getCellProps();
		let children;

		switch (column.key) {
			case 'actions':
				children = <Actions product={rowData} />;
				break;
			default:
				children = <Text>{String(cellData)}</Text>;
		}
		return <Table.Row.Cell {...getCellProps()}>{children}</Table.Row.Cell>;
	};

	return (
		<Table columns={columns} data={products} sort={sort}>
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
				{({ item }) => (
					<Table.Row rowData={item} columns={columns}>
						{renderCell}
					</Table.Row>
				)}
			</Table.Body>
		</Table>
	);
};

export default ProductsTable;
