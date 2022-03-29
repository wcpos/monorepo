import * as React from 'react';
import { ScrollView } from 'react-native';
import {
	toIdSchema,
	retrieveSchema,
	getDefaultFormState,
	getDefaultRegistry,
	mergeObjects,
} from './form.helpers';
import { toErrorList } from './validate';
import { ErrorList } from './error-list';

/**
 *
 */
export function Form<T extends object>({
	schema,
	uiSchema = {},
	formData: inputFormData,
	onChange,
	extraErrors = {},
	...props
}: import('./types').FormProps<T>): React.ReactElement {
	const rootSchema = schema;
	const formData = getDefaultFormState(schema, inputFormData, rootSchema); // populates defaults
	const retrievedSchema = retrieveSchema(schema, rootSchema, formData); // don't know why this is needed

	// creates recursive ids
	// don't know why it needs formData?
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

	const errors = React.useMemo(() => {
		const errorSchema = mergeObjects(props.errorSchema, extraErrors, !!'concat arrays');
		return toErrorList(errorSchema);
	}, [props.errorSchema, extraErrors]);

	return (
		<>
			{errors.length > 0 && <ErrorList errors={errors} />}
			<SchemaField
				schema={schema}
				uiSchema={uiSchema}
				idSchema={idSchema}
				// idPrefix={idPrefix}
				// formContext={formContext}
				formData={formData}
				registry={registry}
				onChange={onChange}
				{...props}
			/>
		</>
	);
}
