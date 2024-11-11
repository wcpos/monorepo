import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText } from '@wcpos/components/src/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogTitle,
	DialogTrigger,
	DialogHeader,
} from '@wcpos/components/src/dialog';

import { EditCartCustomerForm } from './edit-cart-customer';
import { useT } from '../../../../contexts/translations';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Customer = ({
	setShowCustomerSelect,
}: {
	setShowCustomerSelect: React.Dispatch<React.SetStateAction<boolean>>;
}) => {
	const { currentOrder } = useCurrentOrder();
	const billing = useObservableEagerState(currentOrder.billing$);
	const shipping = useObservableEagerState(currentOrder.shipping$);
	const customer_id = useObservableEagerState(currentOrder.customer_id$);
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
					size="xs"
					leftIcon="user"
					removable={true}
					onRemove={() => setShowCustomerSelect(true)}
				>
					<ButtonText>{name}</ButtonText>
				</ButtonPill>
			</DialogTrigger>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>{t('Edit Customer Address', { _tags: 'core' })}</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<EditCartCustomerForm />
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
};
