import * as React from 'react';

import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import pick from 'lodash/pick';
import { isRxDocument } from 'rxdb';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import useSnackbar from '@wcpos/components/src/snackbar';
import Text from '@wcpos/components/src/text';
import Form from '@wcpos/react-native-jsonschema-form';
import log from '@wcpos/utils/src/logger';

import { CountrySelect, StateSelect } from './country-state-select';
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
	const customerCollection = useCollection('customers');
	const pushDocument = usePushDocument();
	const addSnackbar = useSnackbar();
	const billingCountry = get(customerData, ['billing', 'country']);
	const shippingCountry = get(customerData, ['shipping', 'country']);
	const [loading, setLoading] = React.useState(false);

	/**
	 *
	 */
	const handleSave = React.useCallback(async () => {
		try {
			setLoading(true);
			const doc = await customerCollection.insert(customerData);
			const success = await pushDocument(doc);
			if (isRxDocument(success)) {
				onAdd(doc);
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
		} finally {
			setLoading(false);
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
				'meta_data',
			]),
		};

		return _schema;
	}, [customerCollection.schema.jsonSchema]);

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
			meta_data: {
				'ui:title': t('Meta Data', { _tags: 'core' }),
				'ui:description': null,
				'ui:collapsible': 'closed',
			},
		};
	}, [billingCountry, shippingCountry]);

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
				primaryAction={{
					label: t('Add Customer', { _tags: 'core' }),
					action: handleSave,
					loading,
					disabled: isEmpty(customerData.email),
				}}
				secondaryActions={[
					{ label: t('Cancel', { _tags: 'core' }), action: () => setOpened(false) },
				]}
			>
				<Form formData={customerData} schema={schema} uiSchema={uiSchema} onChange={handleChange} />
			</Modal>
		</>
	);
};

export default AddNewCustomer;
