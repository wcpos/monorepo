import * as React from 'react';
import find from 'lodash/find';
import Table from '../../../../../components/table';
import Button from '../../../../../components/button';
import Image from './cells/image';
import Name from './cells/name';
import Actions from './cells/actions';

type GetCellPropsFunction = import('../../../../../components/table/row').GetCellPropsFunction;

interface IPOSProductsTableRowProps {
	product: any;
	columns: any;
	display: any;
}

const Row = ({ product, columns, display }: IPOSProductsTableRowProps) => {
	const show = (key: string): boolean => {
		const d = find(display, { key });
		return !d.hide;
	};

	return (
		<Table.Row rowData={product} columns={columns}>
			{({ getCellProps }: { getCellProps: GetCellPropsFunction }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'image':
									return <Image product={product} />;
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
