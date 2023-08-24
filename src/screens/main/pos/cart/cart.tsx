import * as React from 'react';

import { ObservableResource, useObservable } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';

import AddFee from './add-fee';
import AddShipping from './add-shipping';
import AddNoteButton from './buttons/add-note';
import OrderMetaButton from './buttons/order-meta';
import PayButton from './buttons/pay';
import SaveButton from './buttons/save-order';
import VoidButton from './buttons/void';
import CartHeader from './cart-header';
import Table from './table';
import Totals from './totals';
import { useCurrentOrder } from '../contexts/current-order';

const Cart = () => {
	const theme = useTheme();
	const { currentOrder } = useCurrentOrder();

	/**
	 * Create an observable for the line items
	 * - this will be used to populate the cart
	 */
	const cart$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([order]) =>
					combineLatest([
						order.populate$('line_items'),
						order.populate$('fee_lines'),
						order.populate$('shipping_lines'),
					]).pipe(
						map(([line_items, fee_lines, shipping_lines]) => ({
							line_items,
							fee_lines,
							shipping_lines,
						}))
					)
				)
			),
		[currentOrder]
	);

	/**
	 * The cart items have to be fetched from the database, which causes a slight flash
	 * By using a resource, we can suspend until the data is ready
	 */
	const cartResource = React.useMemo(() => new ObservableResource(cart$), [cart$]);

	return (
		<Box
			raised
			rounding="medium"
			// style={{ backgroundColor: 'white' }}
			style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
		>
			<ErrorBoundary>
				<CartHeader />
			</ErrorBoundary>
			<Box fill>
				<ErrorBoundary>
					<Suspense>
						<Table resource={cartResource} />
					</Suspense>
				</ErrorBoundary>
			</Box>
			<Box>
				<ErrorBoundary>
					<AddFee />
				</ErrorBoundary>
			</Box>
			<Box>
				<ErrorBoundary>
					<AddShipping />
				</ErrorBoundary>
			</Box>
			<Box>
				<ErrorBoundary>
					<Totals />
				</ErrorBoundary>
			</Box>
			<Box
				horizontal
				space="small"
				padding="small"
				align="center"
				style={{ backgroundColor: theme.colors.lightGrey }}
			>
				<ErrorBoundary>
					<AddNoteButton />
					<OrderMetaButton />
					<SaveButton />
				</ErrorBoundary>
			</Box>
			<Box horizontal>
				<ErrorBoundary>
					<VoidButton />
					<PayButton />
				</ErrorBoundary>
			</Box>
		</Box>
	);
};

export default Cart;
