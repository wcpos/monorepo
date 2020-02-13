import React, { useState, Fragment } from 'react';
import useData from '../../../hooks/use-data';
import Table from './table';
import Actions from './actions';
import { TableLayout } from '../../../components/layout';

const Products = () => {
	const [search, setSearch] = useState('');
	const { data } = useData('products');
	const products = data.slice(0, 2);

	products.forEach(product => {
		if (product && !product.status) {
			product.fetch();
		}
	});

	return (
		<Fragment>
			<TableLayout
				actions={<Actions onSearch={setSearch} />}
				table={<Table products={products} />}
				footer={products && products.length}
			/>
		</Fragment>
	);
};

export default Products;
