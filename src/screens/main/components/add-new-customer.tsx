import * as React from 'react';

import find from 'lodash/find';
import get from 'lodash/get';
import map from 'lodash/map';
import pick from 'lodash/pick';
import set from 'lodash/set';

import Icon from '@wcpos/components/src/icon';
import Modal from '@wcpos/components/src/modal';
import Tabs from '@wcpos/components/src/tabs';
import Tree from '@wcpos/components/src/tree';
// import useCountries from '@wcpos/hooks/src/use-countries';
import Form from '@wcpos/react-native-jsonschema-form';

import useLocalData from '../../../contexts/local-data';
import { t } from '../../../lib/translations';
import useRestHttpClient from '../hooks/use-rest-http-client';

/**
 *
 */
const AddNewCustomer = () => {
	const [opened, setOpened] = React.useState(false);
	const [index, setIndex] = React.useState(0);
	const [customerData, setCustomerData] = React.useState({});
	const { storeDB } = useLocalData();
	const customerCollection = storeDB.collections.customers;
	const http = useRestHttpClient();
	const [extraErrors, setExtraErrors] = React.useState();
	// const { resource } = useCountries();
	const countries = {};

	const handleSave = async () => {
		const result = await http.post('customers', { data: customerData }).catch((error) => {
			if (error.response) {
				const { data } = error.response;
				const { data: d, code, message } = data;
				if (d.params) {
					const param = d.params[0];
					setExtraErrors({
						[param]: {
							__errors: [message],
						},
					});
				} else {
					setExtraErrors({
						__errors: [message],
					});
				}
			}
		});

		if (result?.status === 201 || result?.status === 200) {
			const newCustomer = await customerCollection.insert(result.data);
			if (newCustomer) {
				setOpened(false);
			}
		}
	};

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
		};
	}, []);

	const renderScene = ({ route }) => {
		switch (route.key) {
			case 'form':
				return (
					<Form
						schema={schema}
						formData={customerData}
						onChange={handleChange}
						extraErrors={extraErrors}
						uiSchema={uiSchema}
					/>
				);
			case 'json':
				return <Tree data={customerData} />;
			default:
				return null;
		}
	};

	const routes = [
		{ key: 'form', title: 'Form' },
		{ key: 'json', title: 'JSON' },
	];

	return (
		<>
			<Icon name="userPlus" onPress={() => setOpened(true)} tooltip="Add new customer" />

			<Modal
				size="large"
				opened={opened}
				onClose={() => setOpened(false)}
				title="Add New Customer"
				primaryAction={{ label: 'Add Customer', action: handleSave }}
				secondaryActions={[{ label: 'Cancel', action: () => setOpened(false) }]}
			>
				<Tabs<(typeof routes)[number]>
					navigationState={{ index, routes }}
					renderScene={renderScene}
					onIndexChange={setIndex}
				/>
			</Modal>
		</>
	);
};

export default AddNewCustomer;
