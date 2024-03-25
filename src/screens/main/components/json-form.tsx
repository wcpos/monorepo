import * as React from 'react';

import pick from 'lodash/pick';
import { useObservableState, useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Form from '@wcpos/react-native-jsonschema-form';
import log from '@wcpos/utils/src/logger';

// TypeScript types for props
export interface JSONFormProps {
	json: Record<string, any>;
	fields: string[];
	uiSchema?: Record<string, any>;
	onChange?: (newData: Record<string, any>) => void;
}

export const JSONForm = ({ json, fields, uiSchema, onChange }: JSONFormProps) => {
	// Pick only the required fields from the document data
	const data = pick(json, fields);

	// Create a schema based on the document's collection schema and the required fields
	const schema = React.useMemo(() => {
		return {
			...document?.collection.schema.jsonSchema,
			properties: pick(document?.collection.schema.jsonSchema.properties, fields),
			title: null,
			description: null,
		};
	}, [document?.collection.schema.jsonSchema, fields]);

	// Render the form with the derived schema, UI schema, and form data
	return <Form schema={schema} uiSchema={uiSchema} formData={data} onChange={onChange} />;
};
