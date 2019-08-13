import React, { useState } from 'react';
import orderBy from 'lodash/orderBy';
import Table from '../../../components/table';
import Button from '../../../components/button';
import Img from '../../../components/image';
import useDatabase from '../../../hooks/use-database';
import useObservable from '../../../hooks/use-observable';
import Loading from '../../../components/loader';

interface Props {
	products: any;
	ui: any;
}

const ProductsTable = ({ products, ui }: Props) => {
	const [sortBy, setSortBy] = useState('name');
	const [sortDirection, setSortDirection] = useState('asc');
	const database = useDatabase();

	const sort = ({ sortBy, sortDirection }: any) => {
		setSortBy(sortBy);
		setSortDirection(sortDirection);
	};

	// @ts-ignore
	const sortedProducts = orderBy(products, [sortBy, 'id'], [sortDirection, 'asc']);

	const addToCart = async (product: any) => {
		const orders = await database.collections
			.get('orders')
			.query()
			.fetch();
		const activeOrder = orders[0];
		await activeOrder.addToCart(product);
	};

	const columns = useObservable(ui.columns.observeWithColumns(['hide']));

	if (!columns) {
		return <Loading />;
	}

	const cols = columns
		.filter((column: any) => !column.hide)
		.sort(function(a, b) {
			return a.order - b.order;
		})
		.map((column: any) => {
			switch (column.key) {
				case 'thumbnail':
					column.cellRenderer = ({ cellData }: any) => (
						<Img source={cellData} style={{ width: 100, height: 100 }} />
					);
					break;
				// case 'name':
				// 	column.cellRenderer = ({ rowData }: any) => <Name product={rowData} />;
				// 	break;
				// case 'sku':
				// 	column.cellRenderer = ({ cellData }: any) => <Text>{cellData}</Text>;
				// 	break;
				// case 'price':
				// 	column.cellRenderer = ({ rowData }: any) => <RegularPrice product={rowData} />;
				// 	break;
				case 'actions':
					column.cellRenderer = ({ rowData }: any) => (
						<Button
							title="+"
							onPress={() => {
								addToCart(rowData);
							}}
						/>
					);
					break;
			}
			return column;
		});

	return (
		<Table
			items={sortedProducts || []}
			columns={cols}
			sort={sort}
			sortBy={sortBy}
			// @ts-ignore
			sortDirection={sortDirection}
		/>
	);
};

export default ProductsTable;
