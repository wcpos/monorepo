import * as React from 'react';
import { useObservableState, useObservable } from 'observable-hooks';
import { Observable } from 'rxjs';
import { switchMap, filter } from 'rxjs/operators';
import { isRxDocument } from 'rxdb/plugins/core';
import Segment from '@wcpos/common/src/components/segment';
import Text from '@wcpos/common/src/components/text';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Table from './table';
import CustomerSelect from '../../common/customer-select';
import AddCustomer from '../../common/add-edit-customer';
import Totals from './totals';
import Buttons from './buttons';
import { POSContext } from '../pos';

type Sort = import('@wcpos/common/src/components/table/types').Sort;
type OrderDocument = import('@wcpos/common/src/database').OrderDocument;
type CustomerDocument = import('@wcpos/common/src/database').CustomerDocument;

interface ICartProps {
	ui: any;
	orders: OrderDocument[];
}

const Cart = ({ ui, orders = [] }: ICartProps) => {
	useWhyDidYouUpdate('Cart', { ui, orders });
	const { currentOrder, setCurrentOrder, currentCustomer, setCurrentCustomer } =
		React.useContext(POSContext);
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
				// switchMap(([o, q]) => o.getCart$(q))
				switchMap(([o, q]) => o.cart$)
			),
		[currentOrder, query]
	) as Observable<any[]>;

	const items = useObservableState(items$, []);

	const handleSelectCustomer = React.useCallback(
		(value: CustomerDocument) => {
			if (currentOrder) {
				currentOrder.addCustomer(value);
			}
			setCurrentCustomer(value);
		},
		[currentOrder, setCurrentCustomer]
	);

	return (
		<Segment.Group>
			<Segment style={{ flexDirection: 'row', alignItems: 'center' }}>
				<CustomerSelect
					selectedCustomer={currentCustomer}
					onSelectCustomer={handleSelectCustomer}
				/>
				<AddCustomer />
			</Segment>
			{currentOrder ? (
				<Segment.Group>
					<Segment grow>
						<Table items={items} columns={columns} query={query} onSort={handleSort} ui={ui} />
					</Segment>
					<Segment>
						<Totals order={currentOrder} />
					</Segment>
					<Segment>
						<Buttons order={currentOrder} />
					</Segment>
				</Segment.Group>
			) : (
				<Segment content="Add item to cart" />
			)}
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
