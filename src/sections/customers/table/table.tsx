import React, { useState } from 'react';
import orderBy from 'lodash/orderBy';
import Table from '../../../components/table';
import Button from '../../../components/button';
import Img from '../../../components/image';
import Address from './address';

interface Props {
	customers: import('../../../store/models/types').Customers;
}

const CustomersTable = ({ customers }: Props) => {
	const [sortBy, setSortBy] = useState('last_name');
	const [sortDirection, setSortDirection] = useState('asc');

	const sort = ({ sortBy, sortDirection }: any) => {
		setSortBy(sortBy);
		setSortDirection(sortDirection);
	};

	const sortedCustomers = orderBy(customers, [sortBy, 'id'], [sortDirection, 'asc']);

	return (
		<Table
			items={sortedCustomers || []}
			columns={[
				{
					key: 'avatar_url',
					label: '',
					disableSort: true,
					cellRenderer: ({ cellData }: any) => (
						<Img src={cellData} style={{ width: 100, height: 100 }} />
					),
				},
				{ key: 'first_name', label: 'First Name' },
				{ key: 'last_name', label: 'Last Name' },
				{ key: 'email', label: 'Email' },
				{ key: 'role', label: 'Role' },
				{ key: 'username', label: 'Username' },
				{
					key: 'billing',
					label: 'Billing Address',
					cellRenderer: ({ cellData }: any) => <Address address={cellData} />,
				},
				{
					key: 'shipping',
					label: 'Shipping Address',
					cellRenderer: ({ cellData }: any) => <Address address={cellData} />,
				},
				{
					key: 'actions',
					label: 'Actions',
					disableSort: true,
					cellRenderer: ({ rowData }: any) => (
						<Button
							title="Show"
							onPress={() => {
								console.log(rowData);
							}}
						/>
					),
				},
			]}
			sort={sort}
			sortBy={sortBy}
			sortDirection={sortDirection}
		/>
	);
};

export default CustomersTable;
