import * as React from 'react';
import pick from 'lodash/pick';
import Button from '@wcpos/components/src/button';
import Modal, { useModal } from '@wcpos/components/src/modal';
import { t } from '@wcpos/core/src/lib/translations';
import EditModal from '../../../common/edit-modal';

interface OrderMetaButtonProps {
	order: import('@wcpos/database').OrderDocument;
}

const OrderMetaButton = ({ order }: OrderMetaButtonProps) => {
	const { ref, open, close } = useModal();

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
			billing: { 'ui:collapsible': 'closed', 'ui:title': t('Billing Address') },
			shipping: { 'ui:collapsible': 'closed', 'ui:title': t('Shipping Address') },
			tax_lines: { 'ui:collapsible': 'closed', 'ui:title': t('Taxes') },
			meta_data: { 'ui:collapsible': 'closed', 'ui:title': t('Meta Data') },
		}),
		[]
	);

	return (
		<>
			<Button title={t('Order Meta')} background="outline" onPress={open} />
			<Modal ref={ref} title={t('Edit Order')}>
				<EditModal item={order} schema={schema} uiSchema={uiSchema} />
			</Modal>
		</>
	);
};

export default OrderMetaButton;
