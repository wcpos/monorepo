import * as React from 'react';

import {
	useObservableSuspense,
	ObservableResource,
	useObservableEagerState,
} from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { useModal } from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../contexts/translations';
import { EditDocumentForm } from '../components/edit-document-form';
import usePushDocument from '../contexts/use-push-document';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

const fields = [
	'number',
	'discount_total',
	'discount_tax',
	'shipping_total',
	'shipping_tax',
	'cart_tax',
	'total',
	'total_tax',
	'prices_include_tax',
	// 'customer_id',
	// 'customer_note',
	// 'billing',
	// 'shipping',
	'payment_method',
	'payment_method_title',
	'tax_lines',
	'coupon_lines',
	'refunds',
	'meta_data',
	'currency',
	'currency_symbol',
];

/**
 *
 */
const EditOrder = ({ resource }: Props) => {
	const order = useObservableSuspense(resource);
	const { setPrimaryAction, setTitle } = useModal();
	const pushDocument = usePushDocument();
	const addSnackbar = useSnackbar();
	const t = useT();

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const number = useObservableEagerState(order.number$);

	React.useEffect(() => {
		setTitle(() =>
			number
				? t('Edit Order #{number}', { _tags: 'core', number, _context: 'Checkout Order title' })
				: t('Edit Order', { _tags: 'core' })
		);
	}, [number, setTitle, t]);

	/**
	 * Handle save button click
	 */
	const handleSave = React.useCallback(async () => {
		try {
			setPrimaryAction((prev) => {
				return {
					...prev,
					loading: true,
				};
			});
			const success = await pushDocument(order);
			if (isRxDocument(success)) {
				addSnackbar({
					message: t('Order {id} saved', { _tags: 'core', id: success.id }),
				});
			}
		} catch (error) {
			log.error(error);
		} finally {
			setPrimaryAction((prev) => {
				return {
					...prev,
					loading: false,
				};
			});
		}
	}, [addSnackbar, order, pushDocument, setPrimaryAction, t]);

	/**
	 *
	 */
	React.useEffect(() => {
		setPrimaryAction({
			label: t('Save to Server', { _tags: 'core' }),
			action: handleSave,
		});
	}, [handleSave, setPrimaryAction, t]);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			number: {
				'ui:label': t('Order Number', { _tags: 'core' }),
			},
			discount_total: {
				'ui:label': t('Discount Total', { _tags: 'core' }),
			},
			discount_tax: {
				'ui:label': t('Discount Tax', { _tags: 'core' }),
			},
			shipping_total: {
				'ui:label': t('Shipping Total', { _tags: 'core' }),
			},
			shipping_tax: {
				'ui:label': t('Shipping Tax', { _tags: 'core' }),
			},
			cart_tax: {
				'ui:label': t('Cart Tax', { _tags: 'core' }),
			},
			total: {
				'ui:label': t('Total', { _tags: 'core' }),
			},
			total_tax: {
				'ui:label': t('Total Tax', { _tags: 'core' }),
			},
			prices_include_tax: {
				'ui:label': t('Prices Include Tax', { _tags: 'core' }),
			},
			payment_method: {
				'ui:label': t('Payment Method ID', { _tags: 'core' }),
			},
			payment_method_title: {
				'ui:label': t('Payment Method Title', { _tags: 'core' }),
			},
			billing: {
				'ui:collapsible': 'closed',
				'ui:title': t('Billing Address', { _tags: 'core' }),
				'ui:description': null,
			},
			shipping: {
				'ui:collapsible': 'closed',
				'ui:title': t('Shipping Address', { _tags: 'core' }),
				'ui:description': null,
			},
			tax_lines: {
				'ui:collapsible': 'closed',
				'ui:title': t('Taxes', { _tags: 'core' }),
				'ui:description': null,
			},
			coupon_lines: {
				'ui:collapsible': 'closed',
				'ui:title': t('Coupons', { _tags: 'core' }),
				'ui:description': null,
			},
			refunds: {
				'ui:collapsible': 'closed',
				'ui:title': t('Refunds', { _tags: 'core' }),
				'ui:description': null,
			},
			meta_data: {
				'ui:collapsible': 'closed',
				'ui:title': t('Meta Data', { _tags: 'core' }),
				'ui:description': null,
			},
			currency: {
				'ui:label': t('Currency', { _tags: 'core' }),
			},
			currency_symbol: {
				'ui:label': t('Currency Symbol', { _tags: 'core' }),
			},
		}),
		[t]
	);

	return <EditDocumentForm document={order} fields={fields} uiSchema={uiSchema} />;
};

export default EditOrder;
