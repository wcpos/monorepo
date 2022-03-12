import * as React from 'react';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import Box from '@wcpos/common/src/components/box';
import Text from '@wcpos/common/src/components/text';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import useUIResource from '@wcpos/common/src/hooks/use-ui-resource';
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
import { useCalcTotals } from './calc';

type OrderDocument = import('@wcpos/common/src/database').OrderDocument;

interface CartProps {
	order: OrderDocument;
}

const Cart = ({ order }: CartProps) => {
	const ui = useObservableSuspense(useUIResource('pos.cart'));
	const cartResource = new ObservableResource(order.cart$);
	useCalcTotals(order);

	useWhyDidYouUpdate('Cart', { order, ui });

	return (
		<Box raised rounding="medium" style={{ height: '100%', backgroundColor: 'white' }}>
			<CartHeader order={order} ui={ui} />
			<Box fill>
				<React.Suspense fallback={<Text>loading cart...</Text>}>
					<Table cartResource={cartResource} ui={ui} />
				</React.Suspense>
			</Box>
			<Box>
				<AddFee order={order} />
			</Box>
			<Box>
				<AddShipping order={order} />
			</Box>
			<Box>
				<Totals order={order} />
			</Box>
			<Box horizontal space="small" padding="small" align="center">
				<AddNoteButton order={order} />
				<OrderMetaButton order={order} />
				<SaveButton order={order} />
			</Box>
			<Box horizontal>
				<VoidButton order={order} />
				<PayButton order={order} />
			</Box>
		</Box>
	);
};

export default Cart;
