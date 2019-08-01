import React from 'react';
import { Q } from '@nozbe/watermelondb';
import assign from 'lodash/assign';
import orderBy from 'lodash/orderBy';
import useObservable from '../../../hooks/use-observable';
import Actions from './actions';
import Image from './image';
import RegularPrice from './regular-price';
import Table from '../../../components/table';
import Text from '../../../components/text';
import Name from './name';
import Loading from '../../../components/loader';

interface Props {
	// deleteRecord: () => void;
	// search: string;
	// sort: () => void;
	// sortBy: string;
	// sortDirection: 'asc' | 'desc';
	columns: any;
	products: any;
}

const ProductsTable = ({ products, ...props }: Props) => {
	const columns = useObservable(props.columns.observeWithColumns(['hide']));

	console.log('ProductsTable render');

	if (!columns) {
		return <Loading />;
	}

	// const sortedProducts = orderBy(products, [sortBy, 'id'], [sortDirection, 'asc']);
	// const sortedProducts = orderBy(products, ['name'], ['asc']);
	// console.log(columns);

	// const cols = columns.reduce((result: any, column: any) => {
	//   if (!column.hide) {
	//     result.push(column.toJSON());
	//   }
	//   return result;
	// }, []);

	const cols = columns
		.filter((column: any) => !column.hide)
		.map((column: any) => {
			switch (column.key) {
				case 'image':
					column.cellRenderer = ({ rowData }: any) => <Image product={rowData} />;
					break;
				case 'name':
					column.cellRenderer = ({ rowData }: any) => <Name product={rowData} />;
					break;
				case 'sku':
					column.cellRenderer = ({ cellData }: any) => <Text>{cellData}</Text>;
					break;
				case 'regular_price':
					column.cellRenderer = ({ rowData }: any) => <RegularPrice product={rowData} />;
					break;
				case 'actions':
					column.cellRenderer = ({ rowData }: any) => <Actions product={rowData} />;
					break;
			}
			return column;
		});

	console.log(cols);

	return (
		<Table
			items={products}
			columns={cols}
			// sort={sort}
			// sortBy={sortBy}
			// sortDirection={sortDirection}
		/>
	);
};

export default ProductsTable;
