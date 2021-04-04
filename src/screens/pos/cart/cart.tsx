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
import useAppState from '../../../hooks/use-app-state';

type Sort = import('../../../components/table/types').Sort;
type OrderDocument = import('../../../database').OrderTypes.OrderDocument;

interface ICartProps {
	ui: any;
	orders: OrderDocument[];
}

const Cart = ({ ui, orders = [] }: ICartProps) => {
	const { storeDB, user } = useAppState();
	const currentOrder: unknown = null;

	// const [order, setOrder] = React.useState<OrderDocument | undefined>(get(orders, '0'));
	// const order: OrderDocument | undefined = useObservableState(get(orders, '0.$'));
	// debugger;
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const [query, setQuery] = React.useState({
		sortBy: 'id',
		sortDirection: 'asc',
	});

	const setCurrentOrder = (order?: OrderDocument) => {
		// dispatch({ type: actionTypes.SET_CURRENT_ORDER, payload: { currentOrder: order } });
	};

	// React.useEffect(() => {
	// 	setCurrentOrder(get(orders, '0'));
	// }, []);

	if (!currentOrder) {
		return (
			// @ts-ignore
			<Segment.Group>
				<Segment>
					<CustomerSelect />
				</Segment>
				<Segment>
					{orders.map((order) => (
						<Text onPress={() => setCurrentOrder(order)}>{`${order.id}: ${order.total}`}</Text>
					))}
					<Text onPress={() => setCurrentOrder(undefined)}>New</Text>
				</Segment>
			</Segment.Group>
		);
	}

	const handleSort: Sort = ({ sortBy, sortDirection }) => {
		// @ts-ignore
		setQuery({ ...query, sortBy, sortDirection });
	};

	return (
		// @ts-ignore
		<Segment.Group>
			<Segment>
				<CustomerSelect />
				<Popover content={<Actions columns={columns} ui={ui} />}>
					<Button title="Table Settings" />
				</Popover>
			</Segment>
			<Segment grow>
				<Table
					order={currentOrder as OrderDocument}
					columns={columns}
					query={query}
					onSort={handleSort}
				/>
			</Segment>
			<Segment>
				<Totals order={currentOrder} />
			</Segment>
			<Segment>
				<Button
					title="Add Fee"
					onPress={() => {
						(currentOrder as OrderDocument).addFeeLine({ name: 'Fee', total: '10' });
					}}
				/>
				<Button
					title="Add Shipping"
					onPress={() => {
						(currentOrder as OrderDocument).addShippingLine({
							method_title: 'Shipping',
							total: '5',
						});
					}}
				/>
				<Button
					title="Save"
					onPress={async () => {
						// const path = storePath.split('.');
						// const wpCredentials = user.get(path.slice(1, 5).join('.'));
						// const replicationState = currentOrder.syncRestApi({
						// 	auth: {
						// 		username: wpCredentials.consumer_key,
						// 		password: wpCredentials.consumer_secret,
						// 	},
						// 	push: {},
						// });
						// replicationState.run(false);
					}}
				/>
			</Segment>
			<Segment>
				{orders.map((order) => (
					<Text onPress={() => setCurrentOrder(order)}>{`${order.id}: ${order.total}`}</Text>
				))}
				<Text onPress={() => setCurrentOrder(undefined)}>New</Text>
			</Segment>
		</Segment.Group>
	);
};

export default Cart;
