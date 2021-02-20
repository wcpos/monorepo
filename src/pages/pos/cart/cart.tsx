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

type Sort = import('../../../components/table/types').Sort;

interface ICartProps {
	ui: any;
	order$: any;
}

const Cart: React.FC<ICartProps> = ({ ui, order$ }) => {
	const order: any = useObservableState(order$);
	const [columns] = useObservableState(() => ui.get$('columns'), ui.get('columns'));
	const [query, setQuery] = React.useState({
		sortBy: 'id',
		sortDirection: 'asc',
	});

	if (!order) {
		return (
			<Segment>
				<CustomerSelect />
			</Segment>
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
