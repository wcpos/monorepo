import * as React from 'react';
import { useObservableSuspense, useObservableState, useObservable } from 'observable-hooks';
import { from, of } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
import sumBy from 'lodash/sumBy';
import get from 'lodash/get';
import Segment from '@wcpos/common/src/components/segment';
import Button from '@wcpos/common/src/components/button';
import Popover from '@wcpos/common/src/components/popover';
import Text from '@wcpos/common/src/components/text';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Table from './table';
import CustomerSelect from './customer-select';
import Actions from './actions';
import Totals from './totals';
import { POSContext } from '../pos';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface ICartProps {
	ui: any;
	orders: OrderDocument[];
}

const Cart = ({ ui, orders = [] }: ICartProps) => {
	const { storeDB, user } = useAppState();
	const { currentOrder, setCurrentOrder } = React.useContext(POSContext);
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const [query, setQuery] = React.useState({
		sortBy: 'id',
		sortDirection: 'asc',
	});

	if (!currentOrder) {
		return (
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
		<Segment.Group>
			<Segment>
				<CustomerSelect />
				<Popover content={<Actions columns={columns} ui={ui} />}>
					<Button title="Table Settings" />
				</Popover>
			</Segment>
			<Segment grow>
				<Table order={currentOrder} columns={columns} query={query} onSort={handleSort} />
			</Segment>
			<Segment>
				<Totals order={currentOrder} />
			</Segment>
			<Segment>
				<Button
					title="Add Fee"
					onPress={() => {
						currentOrder.addFeeLine({ name: 'Fee', total: '10' });
					}}
				/>
				<Button
					title="Add Shipping"
					onPress={() => {
						currentOrder.addShippingLine({
							methodTitle: 'Shipping',
							methodId: 'test',
							total: '5',
						});
					}}
				/>
				<Button
					title="Save"
					onPress={async () => {
						const replicationState = currentOrder.syncRestApi({
							push: {},
						});
						replicationState.run(false);
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
