import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';
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
import { CountrySelect, StateSelect } from '../components/country-state-select';
import { EditForm } from '../components/edit-json-form';
import usePushDocument from '../contexts/use-push-document';
import { useLocalMutation } from '../hooks/mutations/use-local-mutation';
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
	const billingCountry = useObservableEagerState(customer.billing.country$);
	const shippingCountry = useObservableEagerState(customer.shipping.country$);
	const { format } = useCustomerNameFormat();
	const t = useT();
	const { localPatch } = useLocalMutation();

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
			// @HACK - if billing.email is empty, set it to customer email
			if (!customer.billing.email) {
				await customer.incrementalPatch({
					billing: { ...customer.billing, email: customer.email },
				});
			}
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
	const schema = React.useMemo(() => {
		const orderSchema = get(customer.collection, 'schema.jsonSchema.properties');
		const fields = ['first_name', 'last_name', 'email', 'role', 'username', 'billing', 'shipping'];
		return {
			properties: pick(orderSchema, fields),
		};
	}, [customer.collection]);

	/**
	 *
	 */
	const uiSchema = React.useMemo(
		() => ({
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
		}),
		[billingCountry, shippingCountry, t]
	);

	/**
	 *
	 */
	return (
		<EditForm
			json={customer.toMutableJSON()}
			schema={schema}
			uiSchema={uiSchema}
			onChange={({ changes }) => localPatch({ document: customer, data: changes })}
		/>
	);
};

export default EditCustomer;
