import * as React from 'react';
import Table from '../../../../components/table';
import Image from './cells/image';
import Name from './cells/name';
import Categories from './cells/categories';
import Tags from './cells/tags';
import Actions from './cells/actions';
import RegularPrice from './cells/regular-price';

type ColumnProps = import('../../../../components/table/types').ColumnProps;
type GetCellPropsFunction = import('../../../../components/table/row').GetCellPropsFunction;
type RowRenderProps = {
	cellData: any;
	column: ColumnProps;
	getCellProps: GetCellPropsFunction;
};

interface Props {
	item: any;
	columns: ColumnProps[];
}

const Row = ({ item: product, columns }: Props) => {
	return (
		<Table.Body.Row rowData={product} columns={columns}>
			{({ cellData, column, getCellProps }: RowRenderProps) => (
				<Table.Body.Row.Cell {...getCellProps()}>
					{(() => {
						switch (column.key) {
							case 'image':
								return <Image product={product} />;
							case 'name':
								return <Name product={product} />;
							case 'categories':
								return <Categories product={product} />;
							case 'tags':
								return <Tags product={product} />;
							case 'regularPrice':
								return <RegularPrice regularPrice={cellData} />;
							case 'actions':
								return <Actions product={product} />;
							default:
								return null;
						}
					})()}
				</Table.Body.Row.Cell>
			)}
		</Table.Body.Row>
	);
};

export default Row;
