import React from 'react';
import Table from '../../../../../components/table';
import Button from '../../../../../components/button';
import Name from './cells/name';
import find from 'lodash/find';

const ProductRow = ({ product, columns, display }) => {
	const addToCart = async () => {
		const order = await product.collections().orders.findOne().exec();
		order.addOrUpdateLineItem(product);
	};

	const show = (key: string): boolean => {
		const d = find(display, { key });
		return !d.hide;
	};

	return (
		<Table.Row rowData={product} columns={columns}>
			{({ getCellProps }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'name':
									return (
										<Name
											product={product}
											showSKU={show('sku')}
											showCategories={show('categories')}
											showTags={show('tags')}
										/>
									);
								case 'actions':
									return <Button title="+" onPress={addToCart} />;
								default:
									return null;
							}
						})()}
					</Table.Row.Cell>
				);
			}}
		</Table.Row>
	);
};

export default ProductRow;
