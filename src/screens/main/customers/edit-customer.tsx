import * as React from 'react';

import pick from 'lodash/pick';

import { t } from '../../../lib/translations';
import EditForm from '../components/edit-form';
import { useCustomers } from '../contexts/customers/use-customers';

const EditCustomer = () => {
	const { data } = useCustomers();
	const customer = data.length === 1 && data[0];

	if (!customer) {
		throw new Error(t('Customer not found', { _tags: 'core' }));
	}

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		return {
			...customer.collection.schema.jsonSchema,
			properties: pick(customer.collection.schema.jsonSchema.properties, [
				'id',
				'email',
				'first_name',
				'last_name',
				'role',
				'username',
				'billing',
				'shipping',
				'meta_data',
			]),
		};
	}, [customer.collection.schema.jsonSchema]);

	if (!customer) {
		return null;
	}

	return (
		<EditForm
			item={customer}
			schema={schema}
			// uiSchema={}
		/>
	);
};

export default EditCustomer;
