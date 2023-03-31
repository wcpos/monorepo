import * as React from 'react';

import EditForm from '../components/edit-form';
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
