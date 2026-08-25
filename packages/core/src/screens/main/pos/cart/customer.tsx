import * as React from 'react';

import { ButtonPill, ButtonText } from '@wcpos/components/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@wcpos/components/dialog';
import { useRecordField } from '@wcpos/query';

import { EditCartCustomerForm } from './edit-cart-customer';
import { useT } from '../../../../contexts/translations';
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
			<DialogTrigger asChild>
				<ButtonPill
					testID="cart-customer-name"
					size="xs"
					leftIcon="user"
					removable={true}
					removeTestID="cart-customer-clear"
					onRemove={() => onShowCustomerSelect(true)}
				>
					<ButtonText>{name}</ButtonText>
				</ButtonPill>
			</DialogTrigger>
			<DialogContent testID="customer-address-dialog" size="xl" portalHost="pos">
				<DialogHeader>
					<DialogTitle>{t('pos_cart.edit_customer_address')}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<EditCartCustomerForm />
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
