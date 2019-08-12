import React, { useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../../hooks/use-database';
import useObservable from '../../../hooks/use-observable';
import Table from './table';
import Actions from './actions';
import { TableLayout } from '../../../components/layout';

const Products = () => {
	const [search, setSearch] = useState('');
	const database = useDatabase();
	const products = useObservable(
		database.collections
			.get('products')
			.query(Q.where('name', Q.like(`%${Q.sanitizeLikeString(search)}%`)))
			.observeWithColumns(['name', 'regular_price']),
		[]
	);

	return (
		<TableLayout
			actions={<Actions onSearch={setSearch} />}
			table={<Table products={products} />}
			footer={products && products.length}
		/>
	);
};

export default Products;
