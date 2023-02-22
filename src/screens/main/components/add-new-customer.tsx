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
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Form from '@wcpos/react-native-jsonschema-form';

import useLocalData from '../../../contexts/local-data';
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

	const renderScene = ({ route }) => {
		switch (route.key) {
			case 'form':
				return (
					<Form
						schema={schema}
						formData={customerData}
						onChange={handleChange}
						extraErrors={extraErrors}
						uiSchema={{
							id: { 'ui:readonly': true },
							billing: { 'ui:collapsible': 'closed', 'ui:title': 'Billing Address' },
							shipping: { 'ui:collapsible': 'closed', 'ui:title': 'Shipping Address' },
							meta_data: { 'ui:collapsible': 'closed', 'ui:title': 'Meta Data' },
						}}
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

	useWhyDidYouUpdate('AddEditCustomer', {
		customerData,
		index,
		routes,
		handleSave,
		handleChange,
		renderScene,
		setIndex,
	});

	return (
		<>
			<Icon
				size="medium"
				name="userPlus"
				onPress={() => {
					setOpened(true);
				}}
				tooltip="Add new customer"
			/>

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
