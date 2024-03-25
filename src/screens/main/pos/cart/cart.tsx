import * as React from 'react';

import { ObservableResource, useObservable, useSubscription } from 'observable-hooks';
import { combineLatest, of } from 'rxjs';
import { map, switchMap, debounceTime } from 'rxjs/operators';
import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';

import AddFee from './add-fee';
import { AddMiscProduct } from './add-misc-product';
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
					<Table />
				</ErrorBoundary>
			</Box>
			<Box>
				<ErrorBoundary>
					<AddMiscProduct />
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
			{/* <Box>
				<ErrorBoundary>
					<Totals extraTotals$={extraTotals$} />
				</ErrorBoundary>
			</Box> */}
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
