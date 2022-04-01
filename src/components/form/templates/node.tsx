import * as React from 'react';
import get from 'lodash/get';
import Box from '../../box';
import { useFormContext } from '../context';
import { getSchemaType } from '../form.helpers';

type Schema = import('../types').Schema;

const COMPONENT_TYPES = {
	array: 'ArrayField',
	boolean: 'BooleanField',
	integer: 'NumberField',
	number: 'NumberField',
	object: 'ObjectField',
	string: 'StringField',
	null: 'NullField',
};

/**
 * Helper to find the correct field component for a given schema type
 */
function getFieldComponent(schema: Schema, uiSchema, fields) {
	const field = get(uiSchema, 'ui:field');
	if (typeof field === 'function') {
		return field;
	}
	if (typeof field === 'string' && field in fields) {
		return fields[field];
	}

	const type = getSchemaType(schema);
	const componentName = type && get(COMPONENT_TYPES, type);

	// If the type is not defined and the schema uses 'anyOf' or 'oneOf', don't
	// render a field and let the MultiSchemaField component handle the form display
	if (!componentName && (schema?.anyOf || schema?.oneOf)) {
		return () => null;
	}

	return componentName in fields
		? fields[componentName]
		: () => {
				const { UnsupportedField } = fields;

				return <UnsupportedField schema={schema} reason="Unknown field type" />;
		  };
}

/**
 *
 */
interface NodeTemplateProps {
	schema: Schema;
	uiSchema: any;
	formData: any;
	name: string;
	idSchema: any;
}

/**
 *
 */
export const NodeTemplate = ({
	schema = {},
	uiSchema = {},
	formData,
	name,
	idSchema,
}: NodeTemplateProps) => {
	const { registry } = useFormContext();
	const FieldComponent = React.useMemo(
		() => getFieldComponent(schema, uiSchema, registry.fields),
		[registry.fields, schema, uiSchema]
	);

	return (
		<Box>
			<FieldComponent
				schema={schema}
				formData={formData}
				uiSchema={uiSchema}
				name={name}
				idSchema={idSchema}
			/>
		</Box>
	);
};
