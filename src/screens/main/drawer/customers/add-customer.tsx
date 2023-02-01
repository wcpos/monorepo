import * as React from 'react';

import { useStore } from '../../../../contexts/store/use-store';
import EditForm from '../../common/edit-form';

const AddCustomer = () => {
	const { storeDB } = useStore();

	return (
		<EditForm
			item={{}}
			schema={storeDB.collections.customers.schema.jsonSchema}
			// uiSchema={}
		/>
	);
};

export default AddCustomer;
