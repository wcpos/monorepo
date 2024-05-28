import * as React from 'react';

import get from 'lodash/get';
import {
	useObservableSuspense,
	ObservableResource,
	useObservableEagerState,
} from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { useModal } from '@wcpos/components/src/modal';
import { SelectWithLabel } from '@wcpos/components/src/select';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../contexts/translations';
import { CountrySelect, StateSelect } from '../components/country-state-select';
import { EditDocumentForm } from '../components/edit-document-form';
import usePushDocument from '../contexts/use-push-document';
import { useOrderStatusLabel } from '../hooks/use-order-status-label';

interface Props {
	resource: ObservableResource<import('@wcpos/database').OrderDocument>;
}

const fields = [
	// 'id',
	'status',
	'number',
	'parent_id',
	// 'order_key',
	// 'created_via',
	// 'version',
	'currency',
	'currency_symbol',
	// 'date_created',
	'date_created_gmt',
	// 'date_modified',
	// 'date_modified_gmt',
	// 'discount_total',
	// 'discount_tax',
	// 'shipping_total',
	// 'shipping_tax',
	// 'cart_tax',
	// 'total',
	// 'total_tax',
	// 'prices_include_tax',
	'customer_id',
	// 'customer_ip_address',
	// 'customer_user_agent',
	'customer_note',
	'billing',
	'shipping',
	// 'is_editable',
	// 'needs_payment',
	// 'needs_processing',
	'payment_method',
	'payment_method_title',
	'transaction_id',
	// 'date_paid',
	'date_paid_gmt',
	// 'date_completed',
	'date_completed_gmt',
	// 'cart_hash',
	// 'line_items',
	// 'tax_lines',
	// 'shipping_lines',
	// 'fee_lines',
	// 'coupon_lines',
	// 'refunds',
	// 'payment_url',
	'meta_data',
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
	const { items } = useOrderStatusLabel();

	if (!order) {
		throw new Error(t('Order not found', { _tags: 'core' }));
	}

	const number = useObservableEagerState(order.number$);
	const billing = useObservableEagerState(order.billing$);
	const shipping = useObservableEagerState(order.shipping$);
	const billingCountry = get(billing, ['country']);
	const shippingCountry = get(shipping, ['country']);

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
	 * Temporary hack until we fetch the order statuses from the server
	 */
	const options = React.useMemo(() => {
		const exists = items.some((item) => item.value === order.status);
		if (!exists) {
			items.push({ label: order.status, value: order.status });
		}
		return items;
	}, [items, order.status]);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
			status: {
				'ui:label': t('Status', { _tags: 'core' }),
				'ui:widget': (props) => <SelectWithLabel {...props} options={options} />,
			},
			number: {
				'ui:label': t('Order Number', { _tags: 'core' }),
			},
			parent_id: {
				'ui:label': t('Parent ID', { _tags: 'core' }),
			},
			currency: {
				'ui:label': t('Currency', { _tags: 'core' }),
			},
			currency_symbol: {
				'ui:label': t('Currency Symbol', { _tags: 'core' }),
			},
			date_created_gmt: {
				'ui:label': t('Date Created', { _tags: 'core' }),
				// 'ui:widget': 'date',
			},
			customer_id: {
				'ui:label': t('Customer ID', { _tags: 'core' }),
			},
			customer_note: {
				'ui:label': t('Customer Note', { _tags: 'core' }),
			},
			billing: {
				'ui:title': t('Billing Address', { _tags: 'core' }),
				'ui:description': null,
				'ui:collapsible': 'closed',
				'ui:order': [
					'first_name',
					'last_name',
					'email',
					'company',
					'phone',
					'address_1',
					'address_2',
					'city',
					'postcode',
					'state',
					'country',
				],
				first_name: {
					'ui:label': t('First Name', { _tags: 'core' }),
				},
				last_name: {
					'ui:label': t('Last Name', { _tags: 'core' }),
				},
				email: {
					'ui:label': t('Email', { _tags: 'core' }),
				},
				address_1: {
					'ui:label': t('Address 1', { _tags: 'core' }),
				},
				address_2: {
					'ui:label': t('Address 2', { _tags: 'core' }),
				},
				city: {
					'ui:label': t('City', { _tags: 'core' }),
				},
				state: {
					'ui:label': t('State', { _tags: 'core' }),
					'ui:widget': (props) => <StateSelect country={billingCountry} {...props} />,
				},
				postcode: {
					'ui:label': t('Postcode', { _tags: 'core' }),
				},
				country: {
					'ui:label': t('Country', { _tags: 'core' }),
					'ui:widget': CountrySelect,
				},
				company: {
					'ui:label': t('Company', { _tags: 'core' }),
				},
				phone: {
					'ui:label': t('Phone', { _tags: 'core' }),
				},
			},
			shipping: {
				'ui:title': t('Shipping Address', { _tags: 'core' }),
				'ui:description': null,
				'ui:collapsible': 'closed',
				'ui:order': [
					'first_name',
					'last_name',
					'company',
					'address_1',
					'address_2',
					'city',
					'postcode',
					'state',
					'country',
				],
				first_name: {
					'ui:label': t('First Name', { _tags: 'core' }),
				},
				last_name: {
					'ui:label': t('Last Name', { _tags: 'core' }),
				},
				address_1: {
					'ui:label': t('Address 1', { _tags: 'core' }),
				},
				address_2: {
					'ui:label': t('Address 2', { _tags: 'core' }),
				},
				city: {
					'ui:label': t('City', { _tags: 'core' }),
				},
				state: {
					'ui:label': t('State', { _tags: 'core' }),
					'ui:widget': (props) => <StateSelect country={shippingCountry} {...props} />,
				},
				postcode: {
					'ui:label': t('Postcode', { _tags: 'core' }),
				},
				country: {
					'ui:label': t('Country', { _tags: 'core' }),
					'ui:widget': CountrySelect,
				},
				company: {
					'ui:label': t('Company', { _tags: 'core' }),
				},
			},
			payment_method: {
				'ui:label': t('Payment Method ID', { _tags: 'core' }),
			},
			payment_method_title: {
				'ui:label': t('Payment Method Title', { _tags: 'core' }),
			},
			transaction_id: {
				'ui:label': t('Transaction ID', { _tags: 'core' }),
			},
			date_paid_gmt: {
				'ui:label': t('Date Paid', { _tags: 'core' }),
				// 'ui:widget': 'date',
			},
			date_completed_gmt: {
				'ui:label': t('Date Completed', { _tags: 'core' }),
				// 'ui:widget': 'date',
			},
			meta_data: {
				'ui:collapsible': 'closed',
				'ui:title': t('Meta Data', { _tags: 'core' }),
				'ui:description': null,
			},
		}),
		[billingCountry, items, shippingCountry, t]
	);

	return <EditDocumentForm document={order} fields={fields} uiSchema={uiSchema} withJSONTree />;
};

export default EditOrder;
