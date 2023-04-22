import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

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
import { CartProvider } from '../../contexts/cart';

export interface CartProps {
	currentOrder: import('@wcpos/database').OrderDocument;
}

const Cart = ({ currentOrder }: CartProps) => {
	const theme = useTheme();

	return (
		<Box
			raised
			rounding="medium"
			// style={{ backgroundColor: 'white' }}
			style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
		>
			<ErrorBoundary>
				<CartHeader order={currentOrder} />
			</ErrorBoundary>

			{!currentOrder.isNew && (
				// show cart only if cart not empty
				// TODO - how to defer this to prevent empty table from rendering?
				<Box fill>
					<CartProvider order={currentOrder}>
						<ErrorBoundary>
							<React.Suspense>
								<Table />
							</React.Suspense>
						</ErrorBoundary>
					</CartProvider>
				</Box>
			)}

			<Box>
				<ErrorBoundary>
					<AddFee order={currentOrder} />
				</ErrorBoundary>
			</Box>
			<Box>
				<ErrorBoundary>
					<AddShipping order={currentOrder} />
				</ErrorBoundary>
			</Box>

			{!currentOrder.isNew && (
				// show order totals only if cart not empty
				<>
					<Box>
						<ErrorBoundary>
							<Totals order={currentOrder} />
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
							<AddNoteButton order={currentOrder} />
							<OrderMetaButton order={currentOrder} />
							<SaveButton order={currentOrder} />
						</ErrorBoundary>
					</Box>
					<Box horizontal>
						<ErrorBoundary>
							<VoidButton order={currentOrder} />
							<PayButton order={currentOrder} />
						</ErrorBoundary>
					</Box>
				</>
			)}
		</Box>
	);
};

/**
 * TODO: I'm not sure if I'm doing this right, but it does make the cart UI better
 * https://beta.reactjs.org/reference/react/useDeferredValue#examples
 *
 * Not having memo seems to work okay
 * If I have memo then the language update doesn't work
 */
// export default React.memo(Cart);
export default Cart;
