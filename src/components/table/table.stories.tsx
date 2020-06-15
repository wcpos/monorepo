import React from 'react';
import { action } from '@storybook/addon-actions';
// import { text, select, boolean } from '@storybook/addon-knobs';

import Table from '.';

export default {
	title: 'Components/Table',
};

export const basicUsage = () => (
	<Table
		columns={[
			{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
			{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
			{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
		]}
		data={[
			{ name: 'Apples', price: 1.29, quantity: 2 },
			{ name: 'Pears', price: 3.1, quantity: 0 },
			{ name: 'Oranges', price: 0.99, quantity: 44 },
		]}
		sort={action('sort')}
		sortBy="name"
		sortDirection="asc"
	/>
);

export const empty = () => (
	<Table
		columns={[
			{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
			{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
			{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
		]}
		data={[]}
		sort={action('sort')}
		sortBy="name"
		sortDirection="asc"
		empty="Nothing found"
	/>
);

export const customTableRow = () => {
	const columns = [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	];
	return (
		<Table
			columns={columns}
			data={[
				{ name: 'Apples', price: 1.29, quantity: 2 },
				{ name: 'Pears', price: 3.1, quantity: 0 },
				{ name: 'Oranges', price: 0.99, quantity: 44 },
			]}
			sort={action('sort')}
			sortBy="name"
			sortDirection="asc"
		>
			{({ item, index }) => (
				<Table.Row rowData={item} columns={columns} style={{ backgroundColor: 'pink' }} />
			)}
		</Table>
	);
};

export const customTableCell = () => {
	const columns = [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	];
	return (
		<Table
			columns={columns}
			data={[
				{ name: 'Apples', price: 1.29, quantity: 2 },
				{ name: 'Pears', price: 3.1, quantity: 0 },
				{ name: 'Oranges', price: 0.99, quantity: 44 },
			]}
			sort={action('sort')}
			sortBy="name"
			sortDirection="asc"
		>
			{({ item }) => (
				<Table.Row rowData={item} columns={columns}>
					{({ cellData, column }) => {
						if (column.key === 'price') {
							const fixedDecimal = cellData.toFixed(2);
							return <Table.Row.Cell>{`$ ${fixedDecimal}`}</Table.Row.Cell>;
						}
						return <Table.Row.Cell cellData={cellData} />;
					}}
				</Table.Row>
			)}
		</Table>
	);
};

export const customTable = () => {
	const columns = [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	];

	return (
		<Table
			// columns={columns}
			data={[
				{ name: 'Apples', price: 1.29, quantity: 2 },
				{ name: 'Pears', price: 3.1, quantity: 0 },
				{ name: 'Oranges', price: 0.99, quantity: 44 },
			]}
		>
			<Table.Header>
				<Table.HeaderRow>
					{columns.map(({ key, flexGrow, flexShrink, width, label }) => {
						return (
							<Table.HeaderRow.HeaderCell
								key={key}
								dataKey={key}
								flexGrow={flexGrow}
								flexShrink={flexShrink}
								width={width}
								sort={action('sort')}
								sortBy="name"
								sortDirection="asc"
							>
								{label}
							</Table.HeaderRow.HeaderCell>
						);
					})}
				</Table.HeaderRow>
			</Table.Header>
			<Table.Body>
				{({ item }) => (
					<Table.Row rowData={item} columns={columns}>
						{({ cellData, column }) => <Table.Row.Cell cellData={cellData} columnData={column} />}
					</Table.Row>
				)}
			</Table.Body>
		</Table>
	);
};
