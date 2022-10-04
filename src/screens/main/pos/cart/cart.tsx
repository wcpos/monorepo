import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { useTheme } from 'styled-components/native';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import useStore from '@wcpos/hooks/src/use-store';
import { CartProvider } from '@wcpos/core/src/contexts/cart';
import Totals from './totals';
import Table from './table';
import CartHeader from './cart-header';
import AddFee from './add-fee';
import AddShipping from './add-shipping';
import OrderMetaButton from './buttons/order-meta';
import SaveButton from './buttons/save-order';
import AddNoteButton from './buttons/add-note';
import VoidButton from './buttons/void';
import PayButton from './buttons/pay';
import { usePOSContext } from '../context';

const Cart = () => {
	const { uiResources } = useStore();
	const ui = useObservableSuspense(uiResources['pos.cart']);
	const theme = useTheme();
	const { currentOrder } = usePOSContext();

	useWhyDidYouUpdate('Cart', { currentOrder, ui, theme, uiResources });

	if (!currentOrder) {
		return null;
	}

	return (
		<Box
			raised
			rounding="medium"
			// style={{ backgroundColor: 'white' }}
			style={{ backgroundColor: 'white', flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}
		>
			<ErrorBoundary>
				<CartHeader order={currentOrder} ui={ui} />
			</ErrorBoundary>

			{!currentOrder.isCartEmpty() && (
				// show cart only if cart not empty
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<CartProvider order={currentOrder}>
						<ErrorBoundary>
							<React.Suspense fallback={<Text>loading cart items...</Text>}>
								<Table ui={ui} />
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

			{!currentOrder.isCartEmpty() && (
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

export default Cart;
