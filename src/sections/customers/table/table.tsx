import React, { useState } from 'react';
import orderBy from 'lodash/orderBy';
import useObservable from '../../../hooks/use-observable';
import Table from '../../../components/table';
import Button from '../../../components/button';
import Img from '../../../components/image';
import Address from './address';
import Loading from '../../../components/loader';

interface Props {
	customers: import('../../../store/models/types').Customers;
	columns: any;
}

const CustomersTable = ({ customers, ...props }: Props) => {
	const [sortBy, setSortBy] = useState('last_name');
	const [sortDirection, setSortDirection] = useState('asc');

	const sort = ({ sortBy, sortDirection }: any) => {
		setSortBy(sortBy);
		setSortDirection(sortDirection);
	};

	const sortedCustomers = orderBy(customers, [sortBy, 'id'], [sortDirection, 'asc']);

	const columns = useObservable(props.columns.observeWithColumns(['hide']));

	if (!columns) {
		return <Loading />;
	}

	const cols = columns
		.filter((column: any) => !column.hide)
		.sort(function(a, b) {
			return a.order - b.order;
		})
		.map((column: any) => {
			switch (column.key) {
				case 'avatar_url':
					column.cellRenderer = ({ cellData }: any) => (
						<Img src={cellData} style={{ width: 100, height: 100 }} />
					);
					break;
				case 'billing':
					column.cellRenderer = ({ cellData }: any) => <Address address={cellData} />;
					break;
				case 'shipping':
					column.cellRenderer = ({ cellData }: any) => <Address address={cellData} />;
					break;
				case 'actions':
					column.cellRenderer = ({ rowData }: any) => (
						<Button
							title="Show"
							onPress={() => {
								console.log(rowData);
							}}
						/>
					);
					break;
			}
			return column;
		});

	return (
		<Table
			items={sortedCustomers || []}
			columns={cols}
			sort={sort}
			sortBy={sortBy}
			sortDirection={sortDirection}
			empty="No customers found"
		/>
	);
};

export default CustomersTable;
