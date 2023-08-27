import * as React from 'react';

import { useObservableState, useObservableSuspense, ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';

import { useModal } from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import { useT } from '../../../contexts/translations';
import { CountrySelect, StateSelect } from '../components/country-state-select';
import EditForm from '../components/edit-form-with-json';
import usePushDocument from '../contexts/use-push-document';
import { useCustomerNameFormat } from '../hooks/use-customer-name-format/use-customer-name-format';

interface Props {
	resource: ObservableResource<import('@wcpos/database').CustomerDocument>;
}

/**
 *
 */
const EditCustomer = ({ resource }: Props) => {
	const customer = useObservableSuspense(resource);
	const { setPrimaryAction, setTitle } = useModal();
	const pushDocument = usePushDocument();
	const addSnackbar = useSnackbar();
	const billingCountry = useObservableState(customer.billing.country$, customer.billing.country);
	const shippingCountry = useObservableState(customer.shipping.country$, customer.shipping.country);
	const { format } = useCustomerNameFormat();
	const t = useT();

	if (!customer) {
		throw new Error(t('Customer not found', { _tags: 'core' }));
	}

	/**
	 * Set modal title
	 */
	React.useEffect(() => {
		setTitle(() =>
			t('Edit {name}', { _tags: 'core', name: format(customer), _context: 'Edit Customer title' })
		);
	}, [customer, format, setTitle, t]);

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
			const success = await pushDocument(customer);
			if (isRxDocument(success)) {
				addSnackbar({
					message: t('Customer {id} saved', { _tags: 'core', id: success.id }),
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
	}, [addSnackbar, customer, pushDocument, setPrimaryAction, t]);

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
	return (
		<EditForm
			document={customer}
			fields={['first_name', 'last_name', 'email', 'role', 'username', 'billing', 'shipping']}
			uiSchema={{
				first_name: {
					'ui:label': t('First Name', { _tags: 'core' }),
				},
				last_name: {
					'ui:label': t('Last Name', { _tags: 'core' }),
				},
				email: {
					'ui:label': t('Email', { _tags: 'core' }),
				},
				role: {
					'ui:label': t('Role', { _tags: 'core' }),
				},
				username: {
					'ui:label': t('Username', { _tags: 'core' }),
				},
				billing: {
					'ui:title': t('Billing Address', { _tags: 'core' }),
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
						'email',
						'phone',
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
			}}
		/>
	);
};

export default EditCustomer;
