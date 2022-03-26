import * as React from 'react';
import { ScrollView } from 'react-native';
import {
	toIdSchema,
	retrieveSchema,
	getDefaultFormState,
	getDefaultRegistry,
} from './form.helpers';

/**
 *
 */
export function Form<T extends object>({
	schema,
	uiSchema = {},
	formData: inputFormData,
	onChange,
	...props
}: import('./types').FormProps<T>): React.ReactElement {
	const rootSchema = schema;
	const formData = getDefaultFormState(schema, inputFormData, rootSchema);
	const retrievedSchema = retrieveSchema(schema, rootSchema, formData);

	const idSchema = toIdSchema(
		retrievedSchema,
		uiSchema['ui:rootFieldId'],
		rootSchema,
		formData,
		props.idPrefix,
		props.idSeparator
	);

	const registry = React.useMemo(() => {
		const { fields, widgets } = getDefaultRegistry();
		return {
			fields: { ...fields, ...props.fields },
			widgets: { ...widgets, ...props.widgets },
			ArrayFieldTemplate: props.ArrayFieldTemplate,
			ObjectFieldTemplate: props.ObjectFieldTemplate,
			FieldTemplate: props.FieldTemplate,
			definitions: schema.definitions || {},
			rootSchema: schema,
			formContext: props.formContext || {},
		};
	}, [
		props.ArrayFieldTemplate,
		props.FieldTemplate,
		props.ObjectFieldTemplate,
		props.fields,
		props.formContext,
		props.widgets,
		schema,
	]);

	const { SchemaField } = registry.fields;

	return (
		// <ScrollView style={{ height: 300 }}>
		<SchemaField
			schema={schema}
			uiSchema={uiSchema}
			idSchema={idSchema}
			// idPrefix={idPrefix}
			// formContext={formContext}
			formData={formData}
			registry={registry}
			onChange={onChange}
		/>
		// </ScrollView>
	);
}
