import * as React from 'react';

import pick from 'lodash/pick';
import { useObservableState, useObservableEagerState } from 'observable-hooks';
import { map } from 'rxjs/operators';

import Form from '@wcpos/react-native-jsonschema-form';
import log from '@wcpos/utils/src/logger';

// TypeScript types for props
interface DocumentFormProps {
	document: import('rxdb').RxDocument;
	fields: string[];
	uiSchema?: Record<string, any>;
}

const DocumentForm = ({ document, fields, uiSchema }: DocumentFormProps) => {
	// Subscribe to document changes and get the latest document data as JSON
	// FIXME: why does subscribing to document.$ directly cause a re-render loop?
	const [allData] = useObservableState(
		() => document.$.pipe(map((doc) => doc.toJSON())),
		document.toJSON()
	);

	// Pick only the required fields from the document data
	const data = pick(allData, fields);

	// Handle changes in the form data and apply incremental patch to the document
	const handleChange = React.useCallback(
		async (newData) => {
			try {
				await document.incrementalPatch(newData);
			} catch (error) {
				log.error(error);
			}
		},
		[document]
	);

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
	return <Form schema={schema} uiSchema={uiSchema} formData={data} onChange={handleChange} />;
};

export default DocumentForm;
