import * as React from 'react';
import { View } from 'react-native';
import { useObservableState, useObservable } from 'observable-hooks';
import { Observable } from 'rxjs';
import { switchMap, filter } from 'rxjs/operators';
import { isRxDocument } from 'rxdb/plugins/core';
import Segment from '@wcpos/common/src/components/segment';
import Text from '@wcpos/common/src/components/text';
import Tag from '@wcpos/common/src/components/tag';
import Tabs from '@wcpos/common/src/components/tabs';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Table from './table';
import CustomerSelect from '../../common/customer-select';
import AddCustomer from '../../common/add-edit-customer';
import UISettings from '../../common/ui-settings';
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
	// useWhyDidYouUpdate('Cart', { ui, orders });
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

	const cartTabs = React.useMemo(() => {
		return orders.map((order) => {
			return order.total;
		});
	}, [orders]);

	const onSelect = React.useCallback(
		(index) => {
			setCurrentOrder(orders[index]);
		},
		[orders, setCurrentOrder]
	);

	return (
		<Tabs
			// @ts-ignore
			tabs={cartTabs}
			selected={0}
			onSelect={onSelect}
			position="bottom"
		>
			<Segment.Group>
				<Segment style={{ flexDirection: 'row', alignItems: 'center' }}>
					<View style={{ flex: 1 }}>
						{currentCustomer ? (
							<View style={{ flexDirection: 'row', alignItems: 'center' }}>
								<Text>Customer: </Text>
								<Tag
									removable
									onPress={() => {
										console.log('edit customer');
									}}
									onRemove={() => {
										setCurrentCustomer(undefined);
									}}
								>{`${currentCustomer.firstName} ${currentCustomer.lastName}`}</Tag>
							</View>
						) : (
							<CustomerSelect onSelectCustomer={handleSelectCustomer} />
						)}
					</View>
					<AddCustomer />
					<UISettings ui={ui} />
				</Segment>
				{currentOrder ? (
					<Segment.Group grow>
						<Segment grow>
							<Table
								order={currentOrder}
								items={items}
								columns={columns}
								query={query}
								onSort={handleSort}
								ui={ui}
							/>
						</Segment>
						<Segment>
							<Totals order={currentOrder} />
						</Segment>
						<Segment>
							<Buttons order={currentOrder} />
						</Segment>
					</Segment.Group>
				) : (
					<Segment content="Add item to cart" grow />
				)}
			</Segment.Group>
		</Tabs>
	);
};

export default Cart;
