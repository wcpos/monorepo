import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Table from '@wcpos/common/src/components/table';
import Image from './cells/image';
import Name from './cells/name';
import Price from './cells/price';
import SKU from './cells/sku';
import Actions from './cells/actions';

type GetCellPropsFunction = import('@wcpos/common/src/components/table/row').GetCellPropsFunction;

interface IPOSProductsTableRowProps {
	product: any;
	columns: any;
	display: any;
}

const Row = ({ product, columns }: IPOSProductsTableRowProps) => {
	const forceRender = useObservableState(product.$);

	return (
		<Table.Body.Row rowData={product} columns={columns} style={{ height: 100 }}>
			{({ getCellProps }: { getCellProps: GetCellPropsFunction }) => {
				const { cellData, column } = getCellProps();
				return (
					<Table.Body.Row.Cell {...getCellProps()}>
						{((): React.ReactElement | null => {
							switch (column.key) {
								case 'image':
									return <Image product={product} />;
								case 'name':
									return <Name product={product} display={column.display} />;
								case 'sku':
									return <SKU product={product} />;
								case 'price':
									return <Price product={product} />;
								case 'actions':
									return <Actions product={product} />;
								default:
									return null;
							}
						})()}
					</Table.Body.Row.Cell>
				);
			}}
		</Table.Body.Row>
	);
};

export default Row;
