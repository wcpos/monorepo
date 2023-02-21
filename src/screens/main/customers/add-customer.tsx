import * as React from 'react';

import useLocalData from '../../../contexts/local-data';
import EditForm from '../components/edit-form';

const AddCustomer = () => {
	const { storeDB } = useLocalData();

	return (
		<EditForm
			item={{}}
			schema={storeDB.collections.customers.schema.jsonSchema}
			// uiSchema={}
		/>
	);
};

export default AddCustomer;
