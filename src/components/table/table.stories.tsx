import * as React from 'react';
import { action } from '@storybook/addon-actions';
import Text from '../text';
// import { text, select, boolean } from '@storybook/addon-knobs';

import Table, { TableProps } from './table';

export default {
	title: 'Components/Table',
	component: Table,
};

export const BasicUsage = (props: TableProps) => <Table {...props} />;
BasicUsage.args = {
	columns: [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	],
	data: [
		{ name: 'Apples', price: 1.29, quantity: 2 },
		{ name: 'Pears', price: 3.1, quantity: 0 },
		{ name: 'Oranges', price: 0.99, quantity: 44 },
	],
	sort: action('Sort'),
	sortBy: 'name',
	sortDirection: 'asc',
};

export const Empty = (props: TableProps) => <Table {...props} />;
Empty.args = {
	columns: [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	],
	data: [],
	sort: action('Sort'),
	sortBy: 'name',
	sortDirection: 'asc',
	empty: 'Nothing Found',
};

export const CustomTableRow = (props: TableProps) => {
	return (
		<Table {...props}>
			{({ item, index }) => (
				<Table.Body.Row
					rowData={item}
					columns={props.columns}
					style={{ backgroundColor: 'pink' }}
				/>
			)}
		</Table>
	);
};
CustomTableRow.args = {
	columns: [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	],
	data: [
		{ name: 'Apples', price: 1.29, quantity: 2 },
		{ name: 'Pears', price: 3.1, quantity: 0 },
		{ name: 'Oranges', price: 0.99, quantity: 44 },
	],
	sort: action('Sort'),
	sortBy: 'name',
	sortDirection: 'asc',
};

export const CustomTableCell = (props: TableProps) => {
	const columns = [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	];
	return (
		<Table {...props}>
			{({ item }) => (
				<Table.Body.Row rowData={item} columns={props.columns}>
					{({ cellData, column, getCellProps }) => {
						if (column.key === 'price') {
							const fixedDecimal = cellData.toFixed(2);
							return (
								<Table.Body.Row.Cell {...getCellProps()}>
									<Text>{`$ ${fixedDecimal}`}</Text>
								</Table.Body.Row.Cell>
							);
						}
						return (
							<Table.Body.Row.Cell {...getCellProps()}>
								<Text>{cellData}</Text>
							</Table.Body.Row.Cell>
						);
					}}
				</Table.Body.Row>
			)}
		</Table>
	);
};
CustomTableCell.args = {
	columns: [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	],
	data: [
		{ name: 'Apples', price: 1.29, quantity: 2 },
		{ name: 'Pears', price: 3.1, quantity: 0 },
		{ name: 'Oranges', price: 0.99, quantity: 44 },
	],
	sort: action('Sort'),
	sortBy: 'name',
	sortDirection: 'asc',
};

export const CustomTable = (props: TableProps) => {
	return (
		<Table {...props}>
			<Table.Header>
				<Table.Header.Row>
					{({ getHeaderCellProps }) => {
						const { label } = getHeaderCellProps();
						return <Table.Header.Row.Cell {...getHeaderCellProps()}>{label}</Table.Header.Row.Cell>;
					}}
				</Table.Header.Row>
			</Table.Header>
			<Table.Body>
				{({ item }) => (
					<Table.Body.Row rowData={item}>
						{({ cellData, column, getCellProps }) => (
							<Table.Body.Row.Cell {...getCellProps()} cellData={cellData} columnData={column} />
						)}
					</Table.Body.Row>
				)}
			</Table.Body>
		</Table>
	);
};
CustomTable.args = {
	columns: [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	],
	data: [
		{ name: 'Apples', price: 1.29, quantity: 2 },
		{ name: 'Pears', price: 3.1, quantity: 0 },
		{ name: 'Oranges', price: 0.99, quantity: 44 },
	],
	sort: action('Sort'),
	sortBy: 'name',
	sortDirection: 'asc',
};
