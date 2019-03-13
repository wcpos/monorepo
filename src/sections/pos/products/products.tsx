import React, { useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../../hooks/use-database';
import useObservable from '../../../hooks/use-observable';
import Segment, { SegmentGroup } from '../../../components/segment';
import Table from './table';
import Actions from './actions';

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
		<SegmentGroup>
			<Segment>
				<Actions onSearch={setSearch} />
			</Segment>
			<Segment>
				<Table products={products} />
			</Segment>
			<Segment content={products && products.length} />
		</SegmentGroup>
	);
};

export default Products;
