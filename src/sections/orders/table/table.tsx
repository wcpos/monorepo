import React from 'react';
import useObservable from '../../../hooks/use-observable';
import Table from '../../../components/table';
import Button from '../../../components/button';
import Text from '../../../components/text';
import { Name } from '../../../components/format';
import Address from './address';
import Loading from '../../../components/loader';

interface Props {
	// database: any;
	orders: any[];
	// deleteRecord: () => void;
	// search: string;
	// sort: () => void;
	// sortBy: string;
	// sortDirection: 'asc' | 'desc';
	columns: any;
}

const OrdersTable = ({
	orders,
	columns,
	// sort,
	// sortBy,
	// sortDirection,
	...props
}: Props) => {
	const cols = columns
		.filter((column: any) => !column.hide)
		.sort(function(a, b) {
			return a.order - b.order;
		})
		.map((column: any) => {
			switch (column.key) {
				case 'customer':
					column.cellRenderer = ({ rowData }: any) => (
						<Text>
							<Name firstName={rowData.billing.first_name} lastName={rowData.billing.last_name} />
						</Text>
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
							onPress={async () => {
								console.log(rowData);
								const json = await rowData.toJSON();
								console.log(json);
							}}
						/>
					);
					break;
			}
			return column;
		});

	return (
		<Table
			items={orders}
			columns={cols}
			// sort={sort}
			// sortBy={sortBy}
			// sortDirection={sortDirection}
			empty="No orders found"
		/>
	);
};

export default OrdersTable;
