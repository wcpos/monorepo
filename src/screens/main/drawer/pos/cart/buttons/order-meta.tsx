import * as React from 'react';

import pick from 'lodash/pick';

import Button from '@wcpos/components/src/button';
import Modal from '@wcpos/components/src/modal';

import { t } from '../../../../../../lib/translations';
import EditModal from '../../../../common/edit-form';

interface OrderMetaButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

const OrderMetaButton = ({ order }: OrderMetaButtonProps) => {
	const [opened, setOpened] = React.useState(false);

	/**
	 *  filter schema for edit form
	 */
	const schema = React.useMemo(() => {
		return {
			...order.collection.schema.jsonSchema,
			properties: pick(order.collection.schema.jsonSchema.properties, [
				'number',
				'currency',
				'discount_total',
				'discount_tax',
				'shiping_total',
				'shipping_tax',
				'cart_tax',
				'total',
				'total_tax',
				'prices_include_tax',
				'customer_id',
				'customer_note',
				'billing',
				'shipping',
				'payment_method',
				'payment_method_title',
				'meta_data',
				'tax_lines',
				'refunds',
				'currency_symbol',
			]),
		};
	}, [order.collection.schema.jsonSchema]);

	/**
	 *  uiSchema
	 */
	const uiSchema = React.useMemo(
		() => ({
			billing: { 'ui:collapsible': 'closed', 'ui:title': t('Billing Address', { _tags: 'core' }) },
			shipping: {
				'ui:collapsible': 'closed',
				'ui:title': t('Shipping Address', { _tags: 'core' }),
			},
			tax_lines: { 'ui:collapsible': 'closed', 'ui:title': t('Taxes', { _tags: 'core' }) },
			meta_data: { 'ui:collapsible': 'closed', 'ui:title': t('Meta Data', { _tags: 'core' }) },
		}),
		[]
	);

	return (
		<>
			<Button
				title={t('Order Meta', { _tags: 'core' })}
				background="outline"
				onPress={() => {
					setOpened(true);
				}}
				style={{ flex: 1 }}
			/>
			<Modal
				opened={opened}
				size="large"
				onClose={() => {
					setOpened(false);
				}}
				title={t('Edit Order', { _tags: 'core' })}
			>
				<EditModal item={order} schema={schema} uiSchema={uiSchema} />
			</Modal>
		</>
	);
};

export default OrderMetaButton;
