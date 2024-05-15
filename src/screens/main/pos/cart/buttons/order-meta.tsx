import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';
import { isRxDocument } from 'rxdb';

import Button from '@wcpos/components/src/button';
import Modal from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../../../contexts/translations';
import { EditForm } from '../../../components/edit-json-form';
import usePushDocument from '../../../contexts/use-push-document';
import { useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useCurrentOrder } from '../../contexts/current-order';

/**
 * TODO - I either need to keep form data in sync with order.$, or better,
 * get fresh data everytime the modal is opened
 */
const OrderMetaButton = () => {
	const [opened, setOpened] = React.useState(false);
	const pushDocument = usePushDocument();
	const addSnackbar = useSnackbar();
	const { currentOrder } = useCurrentOrder();
	const t = useT();
	const { localPatch } = useLocalMutation();

	/**
	 *
	 */
	const handleSyncToServer = React.useCallback(async () => {
		try {
			const success = await pushDocument(currentOrder);
			if (isRxDocument(success)) {
				addSnackbar({
					message: t('Order {id} saved', { _tags: 'core', id: success.id }),
				});
			}
		} catch (error) {
			log.error(error);
		}
	}, [addSnackbar, currentOrder, pushDocument, t]);

	/**
	 * Get schema
	 */
	const schema = React.useMemo(() => {
		const orderSchema = get(currentOrder.collection, 'schema.jsonSchema.properties');
		const fields = [
			'number',
			// 'status',
			// 'discount_total',
			// 'discount_tax',
			// 'shipping_total',
			// 'shipping_tax',
			// 'cart_tax',
			// 'total',
			// 'total_tax',
			// 'prices_include_tax',
			// 'customer_id',
			// 'customer_note',
			// 'billing',
			// 'shipping',
			// 'payment_method',
			// 'payment_method_title',
			// 'tax_lines',
			// 'coupon_lines',
			// 'refunds',
			// 'meta_data',
			'currency',
			'currency_symbol',
		];
		return {
			properties: pick(orderSchema, fields),
		};
	}, [currentOrder.collection]);

	/**
	 *  uiSchema
	 */
	const uiSchema = React.useMemo(
		() => ({
			'ui:title': null,
			'ui:description': null,
			number: {
				'ui:label': t('Order Number', { _tags: 'core' }),
			},
			// status: {
			// 	'ui:label': t('Status', { _tags: 'core' }),
			// },
			// discount_total: {
			// 	'ui:label': t('Discount Total', { _tags: 'core' }),
			// },
			// discount_tax: {
			// 	'ui:label': t('Discount Tax', { _tags: 'core' }),
			// },
			// shipping_total: {
			// 	'ui:label': t('Shipping Total', { _tags: 'core' }),
			// },
			// shipping_tax: {
			// 	'ui:label': t('Shipping Tax', { _tags: 'core' }),
			// },
			// cart_tax: {
			// 	'ui:label': t('Cart Tax', { _tags: 'core' }),
			// },
			// total: {
			// 	'ui:label': t('Total', { _tags: 'core' }),
			// },
			// total_tax: {
			// 	'ui:label': t('Total Tax', { _tags: 'core' }),
			// },
			// prices_include_tax: {
			// 	'ui:label': t('Prices Include Tax', { _tags: 'core' }),
			// },
			// payment_method: {
			// 	'ui:label': t('Payment Method ID', { _tags: 'core' }),
			// },
			// payment_method_title: {
			// 	'ui:label': t('Payment Method Title', { _tags: 'core' }),
			// },
			// billing: {
			// 	'ui:collapsible': 'closed',
			// 	'ui:title': t('Billing Address', { _tags: 'core' }),
			// 	'ui:description': null,
			// },
			// shipping: {
			// 	'ui:collapsible': 'closed',
			// 	'ui:title': t('Shipping Address', { _tags: 'core' }),
			// 	'ui:description': null,
			// },
			// tax_lines: {
			// 	'ui:collapsible': 'closed',
			// 	'ui:title': t('Taxes', { _tags: 'core' }),
			// 	'ui:description': null,
			// },
			// coupon_lines: {
			// 	'ui:collapsible': 'closed',
			// 	'ui:title': t('Coupons', { _tags: 'core' }),
			// 	'ui:description': null,
			// },
			// refunds: {
			// 	'ui:collapsible': 'closed',
			// 	'ui:title': t('Refunds', { _tags: 'core' }),
			// 	'ui:description': null,
			// },
			// meta_data: {
			// 	'ui:collapsible': 'closed',
			// 	'ui:title': t('Meta Data', { _tags: 'core' }),
			// 	'ui:description': null,
			// },
			currency: {
				'ui:label': t('Currency', { _tags: 'core' }),
			},
			currency_symbol: {
				'ui:label': t('Currency Symbol', { _tags: 'core' }),
			},
		}),
		[t]
	);

	/**
	 *
	 */
	return (
		<>
			<Button
				title={t('Order Meta', { _tags: 'core' })}
				background="outline"
				onPress={() => setOpened(true)}
				style={{ flex: 1 }}
			/>
			{opened && (
				<Modal
					opened
					size="large"
					onClose={() => setOpened(false)}
					title={t('Edit Order', { _tags: 'core' })}
					primaryAction={{
						label: t('Save to Server', { _tags: 'core' }),
						action: handleSyncToServer,
					}}
					secondaryActions={[
						{
							label: t('Cancel', { _tags: 'core' }),
							action: () => setOpened(false),
						},
					]}
				>
					<EditForm
						json={currentOrder.toMutableJSON()}
						schema={schema}
						uiSchema={uiSchema}
						onChange={({ changes }) => localPatch({ document: currentOrder, data: changes })}
					/>
				</Modal>
			)}
		</>
	);
};

export default OrderMetaButton;
