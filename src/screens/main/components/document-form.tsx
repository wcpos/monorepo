import * as React from 'react';

import pick from 'lodash/pick';
import { useObservablePickState } from 'observable-hooks';

import Form from '@wcpos/react-native-jsonschema-form';
import log from '@wcpos/utils/src/logger';

export interface DocumentFormProps {
	document: import('rxdb').RxDocument;
	fields: string[];
	uiSchema?: Record<string, any>;
}

export const DocumentForm = ({ document, fields, uiSchema }: DocumentFormProps) => {
	// Note: just observe the fields we need
	const data = useObservablePickState(
		document.$,
		() => pick(document.getLatest().toJSON(), fields),
		...fields
	);

	/**
	 * Handle change in form data
	 */
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

	/**
	 *
	 */
	const schema = React.useMemo(() => {
		return {
			...document?.collection.schema.jsonSchema,
			properties: pick(document?.collection.schema.jsonSchema.properties, fields),
			title: null,
			description: null,
		};
	}, [document?.collection.schema.jsonSchema, fields]);

	/**
	 *
	 */
	return <Form schema={schema} uiSchema={uiSchema} formData={data} onChange={handleChange} />;
};

export default DocumentForm;
