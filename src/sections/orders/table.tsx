import React from 'react';
import useObservable from '../../hooks/use-observable';
import Table from '../../components/table';
import Button from '../../components/button';
import Text from '../../components/text';
import { Name } from '../../components/format';
import Loading from '../../components/loader';

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
	// sort,
	// sortBy,
	// sortDirection,
	...props
}: Props) => {
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
				case 'customer':
					column.cellRenderer = ({ rowData }: any) => (
						<Text>
							<Name firstName={rowData.billing.first_name} lastName={rowData.billing.last_name} />
						</Text>
					);
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
			items={orders}
			columns={cols}
			// sort={sort}
			// sortBy={sortBy}
			// sortDirection={sortDirection}
		/>
	);
};

export default OrdersTable;
