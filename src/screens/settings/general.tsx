import * as React from 'react';
import Form from '@wcpos/common/src/components/form';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

const uiSchema = {};

export const GeneralSettings = () => {
	const { store } = useAppState();

	return (
		<Form
			schema={store?.collection.schema.jsonSchema}
			uiSchema={uiSchema}
			formData={store.toJSON()}
		/>
	);
};
