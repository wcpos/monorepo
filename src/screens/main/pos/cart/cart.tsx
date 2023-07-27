import * as React from 'react';

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
import { CartProvider } from '../../contexts/cart';
import useCurrentOrder from '../contexts/current-order';

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

			<CartProvider order={currentOrder}>
				<ErrorBoundary>
					<Suspense>
						<Box fill>
							<Table />
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
					</Suspense>
				</ErrorBoundary>
			</CartProvider>
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
