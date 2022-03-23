import * as React from 'react';
import get from 'lodash/get';
import Box from '../../box';
import {
	getSchemaType,
	orderProperties,
	retrieveSchema,
	getDefaultRegistry,
	canExpand,
	ADDITIONAL_PROPERTY_FLAG,
} from '../form.helpers';

type Schema = import('json-schema').JSONSchema7;
type UiSchema = import('../types').UiSchema;
type IdSchema = import('../types').IdSchema;
type Fields = import('../types').Registry['fields'];

const REQUIRED_FIELD_SYMBOL = '*';
const COMPONENT_TYPES = {
	array: 'ArrayField',
	boolean: 'BooleanField',
	integer: 'NumberField',
	number: 'NumberField',
	object: 'ObjectField',
	string: 'StringField',
	null: 'NullField',
};

function getFieldComponent(schema: Schema, uiSchema: UiSchema, idSchema: IdSchema, fields: Fields) {
	const field = get(uiSchema, 'ui:field');
	if (typeof field === 'function') {
		return field;
	}
	if (typeof field === 'string' && field in fields) {
		return fields[field];
	}

	const componentName = get(COMPONENT_TYPES, getSchemaType(schema));

	// If the type is not defined and the schema uses 'anyOf' or 'oneOf', don't
	// render a field and let the MultiSchemaField component handle the form display
	if (!componentName && (schema.anyOf || schema.oneOf)) {
		return () => null;
	}

	return componentName in fields
		? fields[componentName]
		: () => {
				const { UnsupportedField } = fields;

				return (
					<UnsupportedField
						schema={schema}
						idSchema={idSchema}
						reason={`Unknown field type ${schema.type}`}
					/>
				);
		  };
}

/**
 *
 */
export function SchemaField<T extends object>({
	schema,
	uiSchema,
	idSchema,
	idPrefix,
	formContext,
	formData,
	registry,
	name,
	onChange,
}: import('../types').FieldProps<T>): React.ReactElement {
	const { rootSchema, fields } = registry;
	const FieldComponent = getFieldComponent(schema, uiSchema, idSchema, fields);

	return (
		<Box paddingBottom="small">
			<FieldComponent
				schema={schema}
				uiSchema={uiSchema}
				idSchema={idSchema}
				formData={formData}
				name={name}
				onChange={onChange}
				registry={registry}
			/>
		</Box>
	);
}
