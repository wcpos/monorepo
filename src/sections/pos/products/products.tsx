import React, { useState, Fragment } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../../hooks/use-database';
import useObservable from '../../../hooks/use-observable';
import Table from './table';
import Actions from './actions';
import { TableLayout } from '../../../components/layout';
import useUI from '../../../hooks/use-ui';
import Settings from './settings';

const Products = () => {
	const [search, setSearch] = useState('');
	const { storeDB } = useDatabase();

	const products = useObservable(
		storeDB.collections
			.get('products')
			.query(Q.where('name', Q.like(`%${Q.sanitizeLikeString(search)}%`)))
			.observeWithColumns(['name', 'regular_price']),
		[]
	);

	const ui: any = useUI('pos_products');

	return (
		ui && (
			<Fragment>
				<Settings ui={ui} />
				<TableLayout
					actions={<Actions onSearch={setSearch} />}
					table={<Table products={products} ui={ui} />}
					footer={products && products.length}
				/>
			</Fragment>
		)
	);
};

export default Products;
