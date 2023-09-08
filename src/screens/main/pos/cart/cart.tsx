import * as React from 'react';

import { ObservableResource, useObservable, useSubscription } from 'observable-hooks';
import { combineLatest, of } from 'rxjs';
import { map, switchMap, debounceTime } from 'rxjs/operators';
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
import { useTotalsCalculation } from './use-totals-calculation';
import { useCurrentOrder } from '../contexts/current-order';

/**
 * When rxdb properties are updated, they emit for each, eg: total and subtotal
 * This triggers unnecessary calculations, so we debounce the updates
 */
const DEBOUNCE_TIME_MS = 10;

const Cart = () => {
	const theme = useTheme();
	const { currentOrder } = useCurrentOrder();
	const { calculateOrderTotals, extraTotals$ } = useTotalsCalculation(currentOrder);

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

	/**
	 * Create a new observable which emits everytime a line item changes
	 */
	const cartChanged$ = useObservable(
		() =>
			cart$.pipe(
				switchMap(({ line_items, fee_lines, shipping_lines }) => {
					// Function to create an observable for an RxDocument that emits the RxDocument whenever any property changes

					// Create observables for the line items, fee lines, and shipping lines
					// TODO - this should be improved, which properties do I need to watch?
					const lineItemObservables = line_items.map((doc) =>
						combineLatest([doc.total$, doc.total_tax$, doc.taxes$]).pipe(map(() => doc.getLatest()))
					);
					const feeLineObservables = fee_lines.map((doc) =>
						combineLatest([doc.total$, doc.total_tax$, doc.taxes$]).pipe(map(() => doc.getLatest()))
					);
					const shippingLineObservables = shipping_lines.map((doc) =>
						combineLatest([doc.total$, doc.total_tax$, doc.taxes$]).pipe(map(() => doc.getLatest()))
					);

					// Combine the observables and map to the cart object
					return combineLatest([
						lineItemObservables.length ? combineLatest(lineItemObservables) : of([]),
						feeLineObservables.length ? combineLatest(feeLineObservables) : of([]),
						shippingLineObservables.length ? combineLatest(shippingLineObservables) : of([]),
					]).pipe(
						map(([lineItems, feeLines, shippingLines]) => ({
							lineItems,
							feeLines,
							shippingLines,
						}))
					);
				}),
				debounceTime(DEBOUNCE_TIME_MS)
			),
		[cart$]
	);

	/**
	 * Subscribe to cart$ and then subscribe to each item and pass result to calculateOrderTotals
	 */
	useSubscription(cartChanged$, calculateOrderTotals);

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
					<Totals extraTotals$={extraTotals$} />
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
