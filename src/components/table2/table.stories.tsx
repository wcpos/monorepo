import React from 'react';
import Table from './';
import Button from '../button';

export default {
	title: 'Components/Table',
};

export const basicUsage = () => (
	<Table
		columns={[
			{ accessor: 'quantity', Header: 'Qty' },
			{ accessor: 'name', Header: 'Name' },
			{ accessor: 'price', Header: 'Price' },
		]}
		data={[
			{ name: 'Apples', price: 1.29, quantity: 2 },
			{ name: 'Pears', price: 3.1, quantity: 0 },
			{ name: 'Oranges', price: 0.99, quantity: 44 },
		]}
	/>
);

export const sorting = () => (
	<Table
		columns={[
			{ accessor: 'quantity', Header: 'Qty' },
			{ accessor: 'name', Header: 'Name' },
			{ accessor: 'price', Header: 'Price' },
			{ accessor: 'action', Header: '', disableSortBy: true },
		]}
		data={[
			{ name: 'Apples', price: 1.29, quantity: 2, action: <Button title="action" /> },
			{ name: 'Pears', price: 3.1, quantity: 0, action: <Button title="action" /> },
			{ name: 'Oranges', price: 0.99, quantity: 44, action: <Button title="action" /> },
		]}
	/>
);

export const filtering = () => (
	<Table
		columns={[
			{ accessor: 'quantity', Header: 'Qty' },
			{ accessor: 'name', Header: 'Name' },
			{ accessor: 'price', Header: 'Price' },
			{ accessor: 'action', Header: '', disableSortBy: true },
		]}
		data={[
			{ name: 'Apples', price: 1.29, quantity: 2, action: <Button title="action" /> },
			{ name: 'Pears', price: 3.1, quantity: 0, action: <Button title="action" /> },
			{ name: 'Oranges', price: 0.99, quantity: 44, action: <Button title="action" /> },
		]}
	/>
);
