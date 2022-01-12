import * as React from 'react';
import { ScrollView } from 'react-native';
import { toIdSchema, retrieveSchema, getDefaultFormState, getDefaultRegistry } from './utils';
import { SchemaField } from './fields/schema-field';

interface FormProps {
	schema: any;
	uiSchema: any;
	formData: any;
}

export const Form = ({ schema, uiSchema = {}, formData: inputFormData }: FormProps) => {
	const rootSchema = schema;
	const formData = getDefaultFormState(schema, inputFormData, rootSchema);
	const retrievedSchema = retrieveSchema(schema, rootSchema, formData);

	const idSchema = toIdSchema(retrievedSchema, 'root', schema, formData);

	const getRegistry = () => {
		const { fields, widgets } = getDefaultRegistry();
		return { fields, widgets, rootSchema };
	};

	console.log(rootSchema);

	return (
		<ScrollView style={{ height: 300 }}>
			<SchemaField
				schema={schema}
				uiSchema={uiSchema}
				idSchema={idSchema}
				// idPrefix={idPrefix}
				// formContext={formContext}
				formData={formData}
				registry={getRegistry()}
			/>
		</ScrollView>
	);
};
