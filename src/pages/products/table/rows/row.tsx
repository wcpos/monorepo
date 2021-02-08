import * as React from 'react';
import Table from '../../../../components/table';
import Image from './cells/image';
import Categories from './cells/categories';
import Tags from './cells/tags';
import Actions from './cells/actions';

interface Props {
	product: any;
	columns: [];
}

const Row = ({ product, columns }: Props) => {
	return (
		<Table.Row rowData={product} columns={columns}>
			{({ cellData, column, getCellProps }) => (
				<Table.Row.Cell {...getCellProps()}>
					{((): React.ReactElement | null => {
						switch (column.key) {
							case 'image':
								return <Image product={product} />;
							case 'categories':
								return <Categories categories={cellData} />;
							case 'tags':
								return <Tags tags={cellData} />;
							case 'actions':
								return <Actions product={product} />;
							default:
								return null;
						}
					})()}
				</Table.Row.Cell>
			)}
		</Table.Row>
	);
};

export default Row;
