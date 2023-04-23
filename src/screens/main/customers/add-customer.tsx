import * as React from 'react';

import Form from '@wcpos/react-native-jsonschema-form';

import useCollection from '../hooks/use-collection';

const AddCustomer = () => {
	const collection = useCollection('customers');

	return (
		<Form
			item={{}}
			schema={collection.schema.jsonSchema}
			// uiSchema={}
		/>
	);
};

export default AddCustomer;
