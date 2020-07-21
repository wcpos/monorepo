import React from 'react';
import { View } from 'react-native';
import { useObservableSuspense, useObservableState, useObservable } from 'observable-hooks';
import { from, of } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
import sumBy from 'lodash/sumBy';
import useAppState from '../../../hooks/use-app-state';
import Segment from '../../../components/segment';
import Text from '../../../components/text';
import Button from '../../../components/button';
import Table from './table';
import CustomerSelect from './customer-select';
import Actions from './actions';

interface Props {}

const Cart: React.FC<Props> = () => {
	const [{ storeDB }] = useAppState();
	const ui = storeDB.getUI('pos_cart');
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));

	// @TODO - why doesn't this update the totals?
	const query = storeDB.collections.orders.findOne();
	const order$ = query.$.pipe(
		filter((order) => order),
		switchMap((order) => order.$.pipe(map(() => order))),
		tap((res) => console.log(res))
	);

	const order = useObservableState(order$);

	if (!order) {
		return (
			<Segment.Group>
				<Segment>
					<CustomerSelect ui={ui} />
				</Segment>
			</Segment.Group>
		);
	}

	order$.subscribe((res) => console.log(res));

	return (
		<Segment.Group style={{ height: '100%', width: '100%' }}>
			<Segment style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }}>
				<CustomerSelect ui={ui} />
				<Actions ui={ui} columns={columns} />
			</Segment>
			<Segment style={{ flexGrow: 0, flexShrink: 1, flexBasis: 'auto' }}>
				<Table order={order} columns={columns} />
			</Segment>
			<Segment style={{ flexGrow: 0, flexShrink: 0, flexBasis: 'auto' }}>
				<View style={{ flexDirection: 'row' }}>
					<View style={{ flex: 1 }}>
						<Text>Subtotal:</Text>
					</View>
					<View>
						<Text>{order.subtotal}</Text>
					</View>
				</View>
				<View style={{ flexDirection: 'row' }}>
					<View style={{ flex: 1 }}>
						<Text>Total Tax:</Text>
					</View>
					<View>
						<Text>{order.total_tax}</Text>
					</View>
				</View>
				<View style={{ flexDirection: 'row' }}>
					<View style={{ flex: 1 }}>
						<Text>Order Total:</Text>
					</View>
					<View>
						<Text>{order.total}</Text>
					</View>
				</View>
			</Segment>
			<Segment>
				<Button
					title="Add Fee"
					onPress={() => {
						order.addFeeLine({ name: 'Fee', total: '10' });
					}}
				/>
			</Segment>
		</Segment.Group>
	);
};

export default Cart;
