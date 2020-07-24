import React from 'react';
import Table from '../../../../../components/table';
import Button from '../../../../../components/button';
import Name from './cells/name';
import Actions from './cells/actions';
import find from 'lodash/find';

const Row = ({ product, columns, display }) => {
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
									return <Actions product={product} />;
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

export default Row;
