import * as React from 'react';
import { View } from 'react-native';

import { FlashList } from '@shopify/flash-list';
import { action } from '@storybook/addon-actions';

import Table, { TableProps } from '.';
import Button from '../button';
import Dropdown from '../dropdown';
import Text from '../text';
// import { text, select, boolean } from '@storybook/addon-knobs';

import type { Meta } from '@storybook/react';

const meta: Meta<typeof Table> = {
	title: 'Components/Table',
	component: Table,
};

const size = ['Small', 'Medium', 'Large', 'Massive'];
const colour = ['Red', 'Blue', 'Green', 'Yellow'];
const noun = ['Apple', 'Pear', 'Orange', 'Banana'];

const name = () =>
	`${size[Math.floor(Math.random() * noun.length)]} ${
		colour[Math.floor(Math.random() * colour.length)]
	} ${noun[Math.floor(Math.random() * noun.length)]}`;
const price = () => Math.floor(Math.random() * 100);
const quantity = () => Math.floor(Math.random() * 10);
const height = () => 25 + Math.floor(Math.random() * 100);

interface Data {
	name: string;
	price: number;
	quantity: number;
	height: number;
}

const data = new Array(1000)
	.fill(true)
	.map(() => ({ name: name(), price: price(), quantity: quantity(), height: height() }));

/**
 *
 */
export const BasicUsage = (props: TableProps<Data>) => <Table<Data> {...props} />;
BasicUsage.args = {
	columns: [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	],
	data,
	estimatedItemSize: 32,
	style: { height: 300 },
	// sort: action('Sort'),
	// sortBy: 'name',
	// sortDirection: 'asc',
};

export const Empty = (props: TableProps<Data>) => <Table<Data> {...props} />;
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
	estimatedItemSize: 32,
};

// export const CustomTableRow = (props: TableProps<Data>) => {
// 	return (
// 		<Table {...props}>
// 			{(rowProps) => {
// 				const { item, ...rest } = rowProps;
// 				return (
// 					<Table.Row
// 						item={item}
// 						{...rest}
// 						columns={props.columns}
// 						style={{ height: item.height }}
// 					/>
// 				);
// 			}}
// 		</Table>
// 	);
// };
// CustomTableRow.args = {
// 	columns: [
// 		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
// 		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
// 		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
// 	],
// 	data,
// 	style: { height: 300 },
// 	// sort: action('Sort'),
// 	// sortBy: 'name',
// 	// sortDirection: 'asc',
// };

export const CustomTableCell = (props: TableProps<Data>) => {
	return <Table<Data> {...props} />;
};
CustomTableCell.args = {
	columns: [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{
			key: 'price',
			label: 'Price',
			flexGrow: 0,
			flexShrink: 1,
			width: '30%',
		},
	],
	data,
	sort: action('Sort'),
	sortBy: 'name',
	sortDirection: 'asc',
	style: { height: 300 },
};

// export const CustomTable = (props: TableProps) => {
// 	return (
// 		<Table {...props}>
// 			<Table.Header>
// 				<Table.Header.Row>
// 					{({ getHeaderCellProps }) => {
// 						const { label } = getHeaderCellProps();
// 						return <Table.Header.Row.Cell {...getHeaderCellProps()}>{label}</Table.Header.Row.Cell>;
// 					}}
// 				</Table.Header.Row>
// 			</Table.Header>
// 			<Table.Body>
// 				{({ item, columns }) => {
// 					return (
// 						<Table.Body.Row rowData={item} columns={columns}>
// 							{({ cellData, column, getCellProps }) => (
// 								<Table.Body.Row.Cell {...getCellProps()} cellData={cellData} columnData={column} />
// 							)}
// 						</Table.Body.Row>
// 					);
// 				}}
// 			</Table.Body>
// 		</Table>
// 	);
// };
// CustomTable.args = {
// 	columns: [
// 		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
// 		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
// 		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
// 	],
// 	data: [
// 		{ name: 'Apples', price: 1.29, quantity: 2 },
// 		{ name: 'Pears', price: 3.1, quantity: 0 },
// 		{ name: 'Oranges', price: 0.99, quantity: 44 },
// 	],
// 	sort: action('Sort'),
// 	sortBy: 'name',
// 	sortDirection: 'asc',
// };

export const TableFooter = (props: TableProps<Data>) => {
	return <Table<Data> {...props} />;
};
TableFooter.args = {
	columns: [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
	],
	data,
	style: { height: 300 },
	sort: action('Sort'),
	sortBy: 'name',
	sortDirection: 'asc',
	footer: <Text>hi</Text>,
};

/**
 *
 */
export const AddOrRemoveRows = (props: TableProps<Data>) => {
	const [d, setData] = React.useState(props.data);

	const cellRenderer = React.useCallback(
		(item, column, itemIndex) => {
			if (column.key === 'action') {
				return (
					<Button
						title="Remove"
						onPress={() => {
							const newData = [...d];
							newData.splice(itemIndex, 1);
							setData(newData);
						}}
					/>
				);
			}
			return <Text>{String(item[column.key])}</Text>;
		},
		[d]
	);

	/**
	 *
	 */
	const renderItem = React.useCallback(
		({ item, index }) =>
			// renderContext: TableRowRenderContext<T>,
			{
				// subscribe to item, special case to trigger render for data changes
				// TODO: find a better way to do this
				// @ts-ignore
				// const forceRender = useObservableState(item.$);

				return (
					<Table.Row
						// config={renderContext}
						item={item}
						columns={props.columns}
						itemIndex={index}
						cellRenderer={cellRenderer}
					/>
				);
			},
		[cellRenderer, props.columns]
	);

	return (
		<Table<Data>
			{...props}
			data={d}
			renderItem={renderItem}
			footer={
				<Button
					title="Add"
					onPress={() => setData([{ name: 'New Row', price: 0, quantity: 0 }, ...d])}
				/>
			}
		/>
	);
};
AddOrRemoveRows.args = {
	columns: [
		{ key: 'quantity', label: 'Qty', flexGrow: 0, flexShrink: 1, width: '20%' },
		{ key: 'name', label: 'Name', flexGrow: 1, flexShrink: 0, width: '50%' },
		{ key: 'price', label: 'Price', flexGrow: 0, flexShrink: 1, width: '30%' },
		{ key: 'action', label: '', flexGrow: 0, flexShrink: 1, width: '30%' },
	],
	data,
	estimatedItemSize: 48,
	style: { height: 300 },
};

/**
 *
 */
export const FlashListWithPopoverBug = () => {
	return (
		<FlashList
			data={[{ name: 'Item 1' }, { name: 'Item 2' }, { name: 'Item 3' }]}
			renderItem={({ item }) => (
				<View style={{ flexDirection: 'row', padding: 10 }}>
					<Text style={{ width: 200 }}>{item.name}</Text>
					<Dropdown items={['Item 1', 'Item 2', 'Item 3']} placement="top">
						<Text>trigger</Text>
					</Dropdown>
				</View>
			)}
			estimatedItemSize={200}
		/>
	);
};

export default meta;
