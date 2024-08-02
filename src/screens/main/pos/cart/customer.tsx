import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';
import { useObservableEagerState, useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import { ButtonPill, ButtonText } from '@wcpos/tailwind/src/button';
import { Dialog, DialogContent } from '@wcpos/tailwind/src/dialog';
import { Text } from '@wcpos/tailwind/src/text';

import { CustomerForm, CustomerFormValues, SubmitCustomerHandle } from './edit-customer';
import { useT } from '../../../../contexts/translations';
import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import useCustomerNameFormat from '../../hooks/use-customer-name-format';
import { useCurrentOrder } from '../contexts/current-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

/**
 *
 */
const Customer = ({ setShowCustomerSelect }) => {
	const [editModalOpen, setEditModalOpen] = React.useState(false);
	const { currentOrder } = useCurrentOrder();
	const billing = useObservableEagerState(currentOrder.billing$);
	const shipping = useObservableEagerState(currentOrder.shipping$);
	const customer_id = useObservableEagerState(currentOrder.customer_id$);
	const { format } = useCustomerNameFormat();
	const name = format({ billing, shipping, id: customer_id });
	const billingCountry = get(billing, ['country']);
	const shippingCountry = get(shipping, ['country']);
	const t = useT();
	const { localPatch } = useLocalMutation();
	const editCustomerAddressRef = React.useRef<SubmitCustomerHandle>();

	/**
	 *
	 */
	const handleEditCustomerAddress = React.useCallback((data: CustomerFormValues) => {
		// localPatch({ document: currentOrder, data: changes });
	}, []);

	/**
	 *
	 */
	return (
		<Box horizontal align="center" space="small">
			<Text className="font-bold">{t('Customer', { _tags: 'core' })}:</Text>
			<ButtonPill
				size="xs"
				onPress={() => setEditModalOpen(true)}
				removable={true}
				onRemove={() => setShowCustomerSelect(true)}
			>
				<ButtonText>{name}</ButtonText>
			</ButtonPill>

			<Dialog
				open={editModalOpen}
				onOpenChange={setEditModalOpen}
				title={t('Edit Customer Address', { _tags: 'core' })}
			>
				<DialogContent>
					<CustomerForm ref={editCustomerAddressRef} onSubmit={handleEditCustomerAddress} />
				</DialogContent>
			</Dialog>
		</Box>
	);
};

export default Customer;
