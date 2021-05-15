import * as React from 'react';
import { useObservableState, useObservable } from 'observable-hooks';
import { Observable } from 'rxjs';
import { switchMap, filter } from 'rxjs/operators';
import { isRxDocument } from 'rxdb/plugins/core';
import sumBy from 'lodash/sumBy';
import get from 'lodash/get';
import Segment from '@wcpos/common/src/components/segment';
import Button from '@wcpos/common/src/components/button';
import Text from '@wcpos/common/src/components/text';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
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
	useWhyDidYouUpdate('Cart', { ui, orders });
	const { currentOrder, setCurrentOrder } = React.useContext(POSContext);
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const [query, setQuery] = React.useState({
		sortBy: 'id',
		sortDirection: 'asc',
	});

	const handleSort = React.useCallback<Sort>(
		({ sortBy, sortDirection }) => {
			// @ts-ignore
			setQuery({ ...query, sortBy, sortDirection });
		},
		[query]
	);

	const items$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				filter(([o, q]) => isRxDocument(o)),
				// @ts-ignore
				switchMap(([o, q]) => o.getCart$(q))
			),
		[currentOrder, query]
	) as Observable<any[]>;

	const items = useObservableState(items$, []);

	if (!currentOrder) {
		return (
			<Segment.Group>
				<Segment>
					<CustomerSelect />
				</Segment>
				<Segment>
					{orders.map((order) => (
						<Text
							key={order._id}
							onPress={() => setCurrentOrder(order)}
						>{`${order.id}: ${order.total}`}</Text>
					))}
					<Text onPress={() => setCurrentOrder(undefined)}>New</Text>
				</Segment>
			</Segment.Group>
		);
	}

	return (
		<Segment.Group>
			<Segment>
				<CustomerSelect order={currentOrder} />
			</Segment>
			<Segment grow>
				<Table items={items} columns={columns} query={query} onSort={handleSort} ui={ui} />
			</Segment>
			<Segment>
				<Totals order={currentOrder} />
			</Segment>
			<Segment>
				<Button.Group>
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
						title="Add Note"
						onPress={() => {
							currentOrder.atomicPatch({ customerNote: 'This is a note!' });
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
				</Button.Group>
			</Segment>
			<Segment>
				{orders.map((order) => (
					<Text
						key={order._id}
						onPress={() => {
							setCurrentOrder(order);
						}}
					>{`${order.id}: ${order.total}`}</Text>
				))}
				<Text
					onPress={() => {
						setCurrentOrder(undefined);
					}}
				>
					New
				</Text>
			</Segment>
		</Segment.Group>
	);
};

export default Cart;
