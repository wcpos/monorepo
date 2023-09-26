import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';

import { useModal } from '@wcpos/components/src/modal';
import Form from '@wcpos/react-native-jsonschema-form';

import { useT } from '../../../../../contexts/translations';
import { useCollection } from '../../../hooks/use-collection';
import { useMutation } from '../../../hooks/use-mutation';
import { CountrySelect, StateSelect } from '../../country-state-select';

/**
 *
 */
export const AddNewCustomerForm = ({ onAdd }) => {
	const [customerData, setCustomerData] = React.useState({});
	const { collection } = useCollection('customers');
	const t = useT();

	const billingCountry = get(customerData, ['billing', 'country']);
	const shippingCountry = get(customerData, ['shipping', 'country']);
	const { setPrimaryAction } = useModal();
	const [loading, setLoading] = React.useState(false);
	const { create } = useMutation({ collection });

	/**
	 *
	 */
	const handleSave = React.useCallback(async () => {
		setLoading(true);
		try {
			const doc = await create({ data: customerData });
			if (onAdd) {
				onAdd(doc);
			}
		} finally {
			setLoading(false);
		}
	}, [create, customerData, onAdd]);

	/**
	 *
	 */
	React.useEffect(() => {
		setPrimaryAction({
			label: t('Add Customer', { _tags: 'core' }),
			action: () => handleSave(),
			loading,
		});
	}, [handleSave, loading, setPrimaryAction, t]);

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		const _schema = {
			...collection.schema.jsonSchema,
			properties: pick(collection.schema.jsonSchema.properties, [
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
	}, [collection.schema.jsonSchema]);

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
	}, [billingCountry, shippingCountry, t]);

	return (
		<Form formData={customerData} schema={schema} uiSchema={uiSchema} onChange={setCustomerData} />
	);
};
