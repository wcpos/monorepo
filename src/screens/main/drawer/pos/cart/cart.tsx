import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

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
import { CartProvider } from '../../../../../contexts/cart';
import useCurrentOrder from '../contexts/current-order';

const Cart = () => {
	const theme = useTheme();
	const { currentOrder } = useCurrentOrder();
	const hasItems =
		currentOrder.line_items.length > 0 ||
		currentOrder.fee_lines.length > 0 ||
		currentOrder.shipping_lines.length > 0;

	useWhyDidYouUpdate('Cart', { currentOrder, theme });

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

			{hasItems && (
				// show cart only if cart not empty
				<Box style={{ flexGrow: 1, flexShrink: 1, flexBasis: '0%' }}>
					<CartProvider order={currentOrder}>
						<ErrorBoundary>
							<React.Suspense fallback={<Text>loading cart items...</Text>}>
								<Table order={currentOrder} />
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

			{hasItems && (
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
						<AddNoteButton order={currentOrder} />
						<OrderMetaButton order={currentOrder} />
						<SaveButton order={currentOrder} />
					</Box>
					<Box horizontal>
						<VoidButton order={currentOrder} />
						<PayButton order={currentOrder} />
					</Box>
				</>
			)}
		</Box>
	);
};

export default Cart;
