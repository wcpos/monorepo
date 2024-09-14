import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { ButtonPill, ButtonText, Button } from '@wcpos/components/src/button';
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogTitle,
	DialogTrigger,
	DialogHeader,
	DialogFooter,
	DialogClose,
} from '@wcpos/components/src/dialog';
import { Text } from '@wcpos/components/src/text';

import { EditCartCustomerForm } from './edit-cart-customer';
import { useT } from '../../../../contexts/translations';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
export const Customer = ({ setShowCustomerSelect }) => {
	const { currentOrder } = useCurrentOrder();
	const billing = useObservableEagerState(currentOrder.billing$);
	const shipping = useObservableEagerState(currentOrder.shipping$);
	const customer_id = useObservableEagerState(currentOrder.customer_id$);
	const { format } = useCustomerNameFormat();
	const name = format({ billing, shipping, id: customer_id });
	const t = useT();
	const formRef = React.useRef(null);
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
					<DialogTitle>
						<Text>{t('Edit Customer Address', { _tags: 'core' })}</Text>
					</DialogTitle>
				</DialogHeader>
				<DialogBody>
					<EditCartCustomerForm ref={formRef} />
				</DialogBody>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="muted">
							<ButtonText>{t('Cancel', { _tags: 'core' })}</ButtonText>
						</Button>
					</DialogClose>
					<Button
						// variant="secondary"
						onPress={async () => {
							await formRef.current?.handleSaveToOrderAndToCustomer();
							setOpen(false);
						}}
					>
						<ButtonText>{t('Save to Order & Customer', { _tags: 'core' })}</ButtonText>
					</Button>
					<Button
						onPress={async () => {
							await formRef.current?.handleSaveToOrder();
							setOpen(false);
						}}
					>
						<ButtonText>{t('Save to Order', { _tags: 'core' })}</ButtonText>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
