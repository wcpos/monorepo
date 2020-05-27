import React from 'react';
import TableLayout from '../../../layout/table';
import Table from '../../../components/table2';
import Input from '../../../components/textinput';
import Checkbox from '../../../components/checkbox';
import simpleProduct from '../../../../jest/__fixtures__/product.json';

interface Props {}

/**
 *
 * @param param0
 */
const Actions: React.FC<Props> = ({ columns }) => {
	const onFilter = () => {
		console.log('change query');
	};

	const handleColumnShowHide = () => {
		console.log('hi');
	};

	return (
		<React.Fragment>
			<Input placeholder="Search products" onChangeText={onFilter} />
			{columns.map((column: any) => (
				<Checkbox
					key={column.accessor}
					name={column.accessor}
					label={column.Header}
					checked={!column.hide}
					onChange={handleColumnShowHide}
				/>
			))}
		</React.Fragment>
	);
};

/**
 *
 */
const Products: React.FC<Props> = () => {
	const columns = [
		{ accessor: 'image', Header: 'Image', disableSort: true },
		{ accessor: 'name', Header: 'Name' },
		{ accessor: 'sku', Header: 'SKU', hide: true },
		{ accessor: 'price', Header: 'Price' },
		{ accessor: 'actions', Header: 'Actions', disableSort: true },
	];
	const data = [simpleProduct];

	return (
		<TableLayout
			actions={<Actions columns={columns} />}
			table={<Table columns={columns} data={data} />}
			footer="Footer"
		/>
	);
};

export default Products;
