import React, { useState, Fragment } from 'react';
import useData from '../../../hooks/use-data';
import Table from './table';
import Actions from './actions';
import { TableLayout } from '../../../components/layout';

const Products = ({ ui }) => {
	const [search, setSearch] = useState('');
	const { data } = useData('products', search);

	return (
		ui && (
			<Fragment>
				<TableLayout
					actions={<Actions onSearch={setSearch} />}
					table={<Table products={data} ui={ui} />}
					footer={data && data.length}
				/>
			</Fragment>
		)
	);
};

export default Products;
