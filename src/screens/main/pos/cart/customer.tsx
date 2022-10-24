import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import pick from 'lodash/pick';
import compact from 'lodash/compact';
import Box from '@wcpos/components/src/box';
import Text from '@wcpos/components/src/text';
import Pill from '@wcpos/components/src/pill';
import Modal, { useModal } from '@wcpos/components/src/modal';
import { t } from '@wcpos/core/src/lib/translations';
import EditModal from '../../common/edit-modal';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CustomerProps {
	order: OrderDocument;
}

/**
 *
 */
const Customer = ({ order }: CustomerProps) => {
	const { ref, open, close } = useModal();
	const billing = useObservableState(order.billing$, order.billing);
	const shipping = useObservableState(order.shipping$, order.shipping);

	/**
	 *
	 */
	const label = React.useMemo(() => {
		if (order.customer_id === 0) {
			return 'Guest';
		}
		if (billing?.first_name || billing?.last_name) {
			return compact([billing.first_name, billing.last_name]).join(' ');
		}
		if (shipping?.first_name || shipping?.last_name) {
			return compact([shipping.first_name, shipping.last_name]).join(' ');
		}
		if (billing?.email) {
			return billing.email;
		}
		return 'No name?';
	}, [
		billing?.email,
		billing?.first_name,
		billing?.last_name,
		order?.customer_id,
		shipping?.first_name,
		shipping?.last_name,
	]);

	/**
	 *
	 */
	const handleCustomerRemove = React.useCallback(async () => {
		await order.atomicPatch({ customer_id: -1, billing: {}, shipping: {} });
	}, [order]);

	/**
	 *
	 */
	const handleSaveCustomer = React.useCallback(() => {
		console.log('save');
	}, []);

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const _schema = {
			...order.collection.schema.jsonSchema,
			properties: pick(order.collection.schema.jsonSchema.properties, ['billing', 'shipping']),
		};

		return _schema;
	}, [order.collection.schema.jsonSchema]);

	/**
	 *
	 */
	return (
		<Box horizontal align="center" space="small">
			<Text weight="bold">{t('Customer')}:</Text>
			<Pill removable onRemove={handleCustomerRemove} onPress={open}>
				{label}
			</Pill>
			<Modal
				ref={ref}
				title="Edit Customer Addresses"
				primaryAction={{ label: 'Edit Customer', action: handleSaveCustomer }}
				secondaryActions={[{ label: 'Cancel', action: close }]}
			>
				<EditModal
					// formData={{ billing: order.billing, shipping: order.shipping }}
					item={order}
					schema={schema}
					uiSchema={{}}
				/>
			</Modal>
		</Box>
	);
};

export default Customer;
