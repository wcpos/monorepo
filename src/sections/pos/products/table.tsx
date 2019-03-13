import React, { useState } from 'react';
import orderBy from 'lodash/orderBy';
import Table from '../../../components/table';
import Button from '../../../components/button';
import Img from '../../../components/image';
import database from '../../../database';

interface Props {
	products: any;
}

const ProductsTable = ({ products }: Props) => {
	const [sortBy, setSortBy] = useState('name');
	const [sortDirection, setSortDirection] = useState('asc');

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

	return (
		<Table
			items={sortedProducts || []}
			columns={[
				{
					key: 'thumbnail',
					label: '',
					disableSort: true,
					cellRenderer: ({ cellData }: any) => (
						<Img source={cellData} style={{ width: 100, height: 100 }} />
					),
				},
				{ key: 'name', label: 'Name' },
				{ key: 'price', label: 'Price' },
				{
					key: 'actions',
					label: '',
					disableSort: true,
					cellRenderer: ({ rowData }: any) => (
						<Button
							title="+"
							onPress={() => {
								addToCart(rowData);
							}}
						/>
					),
				},
			]}
			sort={sort}
			sortBy={sortBy}
			// @ts-ignore
			sortDirection={sortDirection}
		/>
	);
};

export default ProductsTable;
