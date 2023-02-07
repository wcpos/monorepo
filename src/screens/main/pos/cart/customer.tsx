import * as React from 'react';

import compact from 'lodash/compact';
import pick from 'lodash/pick';
import { useObservableState } from 'observable-hooks';

import Box from '@wcpos/components/src/box';
import Modal from '@wcpos/components/src/modal';
import Pill from '@wcpos/components/src/pill';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import { t } from '../../../../lib/translations';
import EditForm from '../../components/edit-form';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CustomerProps {
	order: OrderDocument;
}

/**
 *
 */
const Customer = ({ order }: CustomerProps) => {
	const [editModalOpened, setEditModalOpened] = React.useState(false);
	// const billing = useObservableState(order.billing$, order.billing);
	// const shipping = useObservableState(order.shipping$, order.shipping);
	const billing = order.billing;
	const shipping = order.shipping;

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
		await order.patch({ customer_id: -1, billing: {}, shipping: {} });
	}, [order]);

	/**
	 *
	 */
	const handleSaveCustomer = React.useCallback(() => {
		log.debug('save');
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
			<Text weight="bold">{t('Customer', { _tags: 'core' })}:</Text>
			<Pill
				removable
				onRemove={handleCustomerRemove}
				onPress={() => {
					setEditModalOpened(true);
				}}
			>
				{label}
			</Pill>

			<Modal
				size="large"
				opened={editModalOpened}
				onClose={() => {
					setEditModalOpened(false);
				}}
				title={t('Edit Customer Addresses', { _tags: 'core' })}
				primaryAction={{ label: t('Edit Customer', { _tags: 'core' }), action: handleSaveCustomer }}
				secondaryActions={[{ label: t('Cancel', { _tags: 'core' }), action: close }]}
			>
				<EditForm
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
