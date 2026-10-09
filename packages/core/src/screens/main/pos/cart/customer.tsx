import * as React from 'react';

import { Chip } from '@wcpos/components/chip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/v2/dialog';
import { useRecordField } from '@wcpos/query';

import { EditCartCustomerForm } from './edit-cart-customer';
import { useT } from '../../../../contexts/translations';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';
import { usePanelSide } from '../contexts/overlay-side/v2';

/**
 *
 */
export function Customer({
	onShowCustomerSelect,
}: {
	onShowCustomerSelect: (show: boolean) => void;
}) {
	const side = usePanelSide('cart');
	const { currentOrderRecord } = useCurrentOrder();
	const billing = useRecordField(currentOrderRecord, (order) => order.payload.billing);
	const shipping = useRecordField(currentOrderRecord, (order) => order.payload.shipping);
	const customer_id = useRecordField(currentOrderRecord, (order) => order.payload.customer_id);
	const { format } = useCustomerNameFormat();
	const name = format({ billing, shipping, id: customer_id });
	const t = useT();
	const [open, setOpen] = React.useState(false);

	/**
	 *
	 */
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			{/* The same chip as the products column's filter pills, so the two columns read
			    as one control set (Paul, 2026-10-09). */}
			<Chip
				testID="cart-customer-name"
				icon="user"
				label={name}
				onPress={() => onShowCustomerSelect(true)}
				// The order sheet has no address editor; keep it on long press.
				onLongPress={() => setOpen(true)}
			/>
			<DialogContent side={side} testID="customer-address-dialog" size="lg" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('pos_cart.edit_customer_address')}</DialogTitle>
				</DialogHeader>
				<EditCartCustomerForm />
			</DialogContent>
		</Dialog>
	);
}
