import * as React from 'react';
import { useObservableSuspense, useObservableState, useObservable } from 'observable-hooks';
import { from, of } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
import sumBy from 'lodash/sumBy';
import get from 'lodash/get';
import Segment from '../../../components/segment';
import Button from '../../../components/button';
import Popover from '../../../components/popover';
import Text from '../../../components/text';
import Table from './table';
import CustomerSelect from './customer-select';
import Actions from './actions';
import Totals from './totals';

type Sort = import('../../../components/table/types').Sort;
type OrderDocument = import('../../../database/types').OrderDocument;

interface ICartProps {
	ui: any;
	orders: OrderDocument[];
}

const Cart = ({ ui, orders = [] }: ICartProps) => {
	const [order, setOrder] = React.useState<OrderDocument | undefined>(get(orders, '0'));
	// const order: OrderDocument | undefined = useObservableState(get(orders, '0.$'));
	// debugger;
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const [query, setQuery] = React.useState({
		sortBy: 'id',
		sortDirection: 'asc',
	});

	if (!order) {
		return (
			<Segment.Group>
				<Segment>
					<CustomerSelect />
				</Segment>
				<Segment>
					{orders.map((order) => (
						<Text onPress={() => setOrder(order)}>{`${order.id}: ${order.total}`}</Text>
					))}
					<Text onPress={() => setOrder(undefined)}>New</Text>
				</Segment>
			</Segment.Group>
		);
	}

	const handleSort: Sort = ({ sortBy, sortDirection }) => {
		// @ts-ignore
		setQuery({ ...query, sortBy, sortDirection });
	};

	return (
		<Segment.Group>
			<Segment>
				<CustomerSelect />
				<Popover content={<Actions columns={columns} ui={ui} />}>
					<Button title="Table Settings" />
				</Popover>
			</Segment>
			<Segment grow>
				<Table order={order} columns={columns} query={query} onSort={handleSort} />
			</Segment>
			<Segment>
				<Totals order={order} />
			</Segment>
			<Segment>
				<Button
					title="Add Fee"
					onPress={() => {
						order.addFeeLine({ name: 'Fee', total: '10' });
					}}
				/>
				<Button
					title="Add Shipping"
					onPress={() => {
						order.addShippingLine({ method_title: 'Shipping', total: '5' });
					}}
				/>
			</Segment>
			<Segment>
				{orders.map((order) => (
					<Text onPress={() => setOrder(order)}>{`${order.id}: ${order.total}`}</Text>
				))}
				<Text onPress={() => setOrder(undefined)}>New</Text>
			</Segment>
		</Segment.Group>
	);
};

export default Cart;
