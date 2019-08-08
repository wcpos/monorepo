import React, { useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../hooks/use-database';
import useObservable from '../../hooks/use-observable';
import useUI from '../../hooks/use-ui';
import Segment, { SegmentGroup } from '../../components/segment';
import Table from './table';
import Actions from './actions';

const Customers = () => {
	const [search, setSearch] = useState('');
	const database = useDatabase();

	const customers = useObservable(
		database.collections
			.get('customers')
			.query(Q.where('last_name', Q.like(`%${Q.sanitizeLikeString(search)}%`)))
			.observeWithColumns(['first_name', 'last_name']),
		[],
		[search]
	);

	const ui: any = useUI('customers');

	return (
		ui && (
			<SegmentGroup style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
				<Segment style={{ flex: '0 1 auto' }}>
					<Actions onSearch={setSearch} />
				</Segment>
				<Segment style={{ flex: '1', padding: 0 }}>
					<Table customers={customers} columns={ui.columns} />
				</Segment>
				<Segment style={{ flex: '0 1 auto' }} content={customers && customers.length} />
			</SegmentGroup>
		)
	);
};

export default Customers;
