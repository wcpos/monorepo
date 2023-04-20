import * as React from 'react';

import find from 'lodash/find';
import get from 'lodash/get';
import map from 'lodash/map';
import pick from 'lodash/pick';
import set from 'lodash/set';
import { isRxDocument } from 'rxdb';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import log from '@wcpos/utils/src/logger';

import EditForm from './edit-form';
import useLocalData from '../../../contexts/local-data';
import { t } from '../../../lib/translations';
import usePushDocument from '../contexts/use-push-document';
import useCollection from '../hooks/use-collection';

interface AddNewCustomerProps {
	onAdd?: (doc: import('@wcpos/database').CustomerDocument) => void;
}

/**
 *
 */
const AddNewCustomer = ({ onAdd }: AddNewCustomerProps) => {
	const [opened, setOpened] = React.useState(false);
	const [customerData, setCustomerData] = React.useState({});
	const { storeDB } = useLocalData();
	const customerCollection = useCollection('customers');
	// const [extraErrors, setExtraErrors] = React.useState();
	// const { resource } = useCountries();
	const countries = {};
	const pushDocument = usePushDocument();
	const addSnackbar = useSnackbar();

	/**
	 *
	 */
	const handleSave = React.useCallback(async () => {
		try {
			const doc = await customerCollection.insert(customerData);
			const success = await pushDocument(doc);
			if (onAdd) {
				onAdd(doc);
			}
			if (isRxDocument(success)) {
				addSnackbar({
					message: t('Customer {id} saved', { _tags: 'core', id: success.id }),
				});
			}
			setOpened(false);
		} catch (error) {
			log.error(error);
			addSnackbar({
				message: t('There was an error: {message}', { _tags: 'core', message: error.message }),
			});
		}
	}, [addSnackbar, customerCollection, customerData, onAdd, pushDocument]);

	/**
	 *
	 */
	const handleChange = React.useCallback((changes) => {
		setCustomerData(changes);
	}, []);

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const _schema = {
			...customerCollection.schema.jsonSchema,
			properties: pick(customerCollection.schema.jsonSchema.properties, [
				// 'id',
				'email',
				'first_name',
				'last_name',
				'role',
				'username',
				'password',
				'billing',
				'shipping',
				'billing',
				'meta_data',
			]),
		};

		// billing
		set(_schema, 'properties.billing.properties.country.enum', map(countries, 'code'));
		set(_schema, 'properties.billing.properties.country.enumNames', map(countries, 'name'));

		if (get(customerData, 'billing.country')) {
			const { states } = find(countries, { code: customerData.billing.country });
			if (states && states.length > 0) {
				set(_schema, 'properties.billing.properties.state.enum', map(states, 'code'));
				set(_schema, 'properties.billing.properties.state.enumNames', map(states, 'name'));
			}
		}

		// shipping
		set(_schema, 'properties.shipping.properties.country.enum', map(countries, 'code'));
		set(_schema, 'properties.shipping.properties.country.enumNames', map(countries, 'name'));

		if (get(customerData, 'shipping.country')) {
			const { states } = find(countries, { code: customerData.shipping.country });
			if (states && states.length > 0) {
				set(_schema, 'properties.shipping.properties.state.enum', map(states, 'code'));
				set(_schema, 'properties.shipping.properties.state.enumNames', map(states, 'name'));
			}
		}

		return _schema;
	}, [countries, customerCollection.schema.jsonSchema, customerData]);

	/**
	 *
	 */
	const uiSchema = React.useMemo(() => {
		return {
			'ui:title': null,
			'ui:description': null,
			'ui:order': ['first_name', 'last_name', 'email', '*'],
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
			password: {
				'ui:label': t('Password', { _tags: 'core' }),
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
				},
				postcode: {
					'ui:label': t('Postcode', { _tags: 'core' }),
				},
				country: {
					'ui:label': t('Country', { _tags: 'core' }),
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
				},
				postcode: {
					'ui:label': t('Postcode', { _tags: 'core' }),
				},
				country: {
					'ui:label': t('Country', { _tags: 'core' }),
				},
				company: {
					'ui:label': t('Company', { _tags: 'core' }),
				},
			},
			meta_data: {
				'ui:title': t('Meta Data', { _tags: 'core' }),
				'ui:description': null,
				'ui:collapsible': 'closed',
			},
		};
	}, []);

	return (
		<>
			<Icon
				name="userPlus"
				onPress={() => setOpened(true)}
				tooltip={t('Add new customer', { _tags: 'core' })}
			/>

			<Modal
				size="large"
				opened={opened}
				onClose={() => setOpened(false)}
				title={t('Add New Customer', { _tags: 'core' })}
				primaryAction={{ label: t('Add Customer', { _tags: 'core' }), action: handleSave }}
				secondaryActions={[
					{ label: t('Cancel', { _tags: 'core' }), action: () => setOpened(false) },
				]}
			>
				<EditForm
					schema={schema}
					formData={customerData}
					onChange={handleChange}
					// extraErrors={extraErrors}
					uiSchema={uiSchema}
				/>
			</Modal>
		</>
	);
};

export default AddNewCustomer;
