import React, { useState } from 'react';
import { Q } from '@nozbe/watermelondb';
import useDatabase from '../../hooks/use-database';
import useObservable from '../../hooks/use-observable';
import useUI from '../../hooks/use-ui';
import Segment, { SegmentGroup } from '../../components/segment';
import Text from '../../components/text';
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
			<SegmentGroup>
				<Segment>
					<Actions onSearch={setSearch} />
				</Segment>
				<Segment>
					{customers && customers.length > 0 ? (
						<Table customers={customers} columns={ui.columns} />
					) : (
						<Text>No customers found</Text>
					)}
				</Segment>
				<Segment content={customers && customers.length} />
			</SegmentGroup>
		)
	);
};

export default Customers;
