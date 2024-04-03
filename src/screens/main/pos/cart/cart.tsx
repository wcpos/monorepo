import * as React from 'react';

import { useTheme } from 'styled-components/native';

import Box from '@wcpos/components/src/box';
import ErrorBoundary from '@wcpos/components/src/error-boundary';

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

/**
 *
 */
const Cart = () => {
	const theme = useTheme();

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
