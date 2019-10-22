import React, { useState } from 'react';
import orderBy from 'lodash/orderBy';
import Table from '../../../../components/table';
import Button from '../../../../components/button';
import Img from '../../../../components/image';
import Popover from '../../../../components/popover';
import Icon from '../../../../components/icon';
import Settings from './settings';
import useDatabase from '../../../../hooks/use-database';
import useUI from '../../../../hooks/use-ui';
import Loading from '../../../../components/loader';
import Name from './name';

interface Props {
	products: any;
}

const ProductsTable = ({ products }: Props) => {
	const [sortBy, setSortBy] = useState('name');
	const [sortDirection, setSortDirection] = useState('asc');
	const { storeDB } = useDatabase();
	const { ui, updateUI } = useUI('pos_products');

	const sort = ({ sortBy, sortDirection }: any) => {
		setSortBy(sortBy);
		setSortDirection(sortDirection);
	};

	// @ts-ignore
	const sortedProducts = orderBy(products, [sortBy, 'id'], [sortDirection, 'asc']);

	const addToCart = async (product: any) => {
		const ordersCollection = storeDB.collections.get('orders');
		const orders = await ordersCollection.query().fetch();
		let activeOrder = orders[0];
		if (!activeOrder) {
			await storeDB.action(async () => {
				activeOrder = await ordersCollection.create(order => {
					order.status = 'pending';
				});
			});
		}
		await activeOrder.addToCart(product);
	};

	const cols = ui.columns
		.filter((column: any) => !column.hide)
		.sort(function(a, b) {
			return a.order - b.order;
		})
		.map((column: any) => {
			switch (column.key) {
				case 'thumbnail':
					column.cellRenderer = ({ cellData }: any) => (
						<Img src={cellData} style={{ width: 100, height: 100 }} />
					);
					break;
				case 'name':
					column.cellRenderer = ({ rowData }: any) => (
						<Name product={rowData} display={ui.display} />
					);
					break;
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
					column.headerCellRenderer = () => (
						<Popover content={<Settings ui={ui} updateUI={updateUI} />}>
							<Icon name="cog" />
						</Popover>
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
