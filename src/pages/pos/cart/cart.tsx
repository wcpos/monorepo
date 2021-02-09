import * as React from 'react';
import { useObservableSuspense, useObservableState, useObservable } from 'observable-hooks';
import { from, of } from 'rxjs';
import { switchMap, tap, catchError, map, filter } from 'rxjs/operators';
import sumBy from 'lodash/sumBy';
import Segment from '../../../components/segment';
import Button from '../../../components/button';
import Popover from '../../../components/popover';
import Table from './table';
import CustomerSelect from './customer-select';
import Actions from './actions';
import Totals from './totals';

interface Props {
	ui: any;
	order$: any;
}

const Cart: React.FC<Props> = ({ ui, order$ }) => {
	const order = useObservableState(order$);
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const [query, setQuery] = React.useState({
		sortBy: 'id',
		sortDirection: 'asc',
	});

	if (!order) {
		return (
			<Segment.Group>
				<Segment>
					<CustomerSelect ui={ui} />
				</Segment>
			</Segment.Group>
		);
	}

	const handleSort = ({ sortBy, sortDirection }) => {
		setQuery({ ...query, sortBy, sortDirection });
	};

	return (
		<Segment.Group>
			<Segment>
				<CustomerSelect ui={ui} />
				<Popover content={<Actions columns={columns} ui={ui} />}>
					<Button title="Table Settings" />
				</Popover>
			</Segment>
			<Segment grow>
				<Table order={order} columns={columns} query={query} onSort={handleSort} />
			</Segment>
			<Segment>
				<Totals order$={order.$} />
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
		</Segment.Group>
	);
};

export default Cart;
