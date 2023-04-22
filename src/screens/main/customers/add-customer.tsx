import * as React from 'react';

import EditForm from '../components/form-with-json';
import useCollection from '../hooks/use-collection';

const AddCustomer = () => {
	const collection = useCollection('customers');

	return (
		<EditForm
			item={{}}
			schema={collection.schema.jsonSchema}
			// uiSchema={}
		/>
	);
};

export default AddCustomer;
