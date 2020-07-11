import React from 'react';
import { useObservableSuspense, useObservableState, useObservable } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import sumBy from 'lodash/sumBy';
import useAppState from '../../../hooks/use-app-state';
import Segment from '../../../components/segment';
import Text from '../../../components/text';
import Table from './table';
import CustomerSelect from './customer-select';

interface Props {}

const Cart: React.FC<Props> = ({ ui }) => {
	const [{ store }] = useAppState();

	const orders = useObservableSuspense(store.getDataResource('orders'));
	const order = orders[0];

	const subtotalSum$ = useObservable(() =>
		order.line_items$.pipe(
			switchMap((ids) => from(order.collections().line_items.findByIds(ids))),
			map((result) =>
				sumBy(Array.from(result.values()), (o) => parseInt(o.computedSubtotal(), 10))
			),
			catchError((err) => console.error(err))
		)
	);

	const computedSubtotal = useObservableState(subtotalSum$, 0);

	if (!order) {
		return (
			<Segment.Group>
				<Segment>
					<CustomerSelect ui={ui} />
				</Segment>
			</Segment.Group>
		);
	}

	return (
		<Segment.Group>
			<Segment>
				<CustomerSelect ui={ui} />
			</Segment>
			<Segment grow>
				<Table order={order} columns={ui.columns} />
			</Segment>
			<Segment>
				<Text>
					Subtotal:
					{computedSubtotal}
				</Text>
				<Text>
					Total Tax:
					{order.total_tax}
				</Text>
				<Text>
					Order Total:
					{order.total}
				</Text>
			</Segment>
		</Segment.Group>
	);
};

export default Cart;
