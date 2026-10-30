import * as React from 'react';

import { Chip } from '@wcpos/components/chip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@wcpos/components/dialog';
import { useRecordField } from '@wcpos/query';

import { EditCartCustomerForm } from './edit-cart-customer';
import { useT } from '../../../../contexts/translations';
import { CustomerAvatar } from '../../components/user-avatar/customer-avatar';
import { useCustomerNameFormat } from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';

/**
 *
 */
export function Customer({
	onShowCustomerSelect,
}: {
	onShowCustomerSelect: (show: boolean) => void;
}) {
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
				// The customer's picture or initials in the icon's slot; the Guest keeps the glyph.
				leading={<CustomerAvatar customer={{ billing, shipping, id: customer_id }} size="xs" />}
				label={name}
				onPress={() => onShowCustomerSelect(true)}
				// The order's address editor sits beside the name as a split chip: long press was
				// undiscoverable on web (owner, 2026-10-22). The pin greys until billing has an address.
				action={{
					icon: 'address',
					onPress: () => setOpen(true),
					accessibilityLabel: t('pos_cart.edit_customer_address'),
					testID: 'cart-customer-address',
					muted: !(billing?.address_1 || billing?.city || billing?.postcode),
				}}
			/>
			<DialogContent side="right" testID="customer-address-dialog" size="lg" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('pos_cart.edit_customer_address')}</DialogTitle>
				</DialogHeader>
				<EditCartCustomerForm key={currentOrderRecord.uuid} />
			</DialogContent>
		</Dialog>
	);
}
