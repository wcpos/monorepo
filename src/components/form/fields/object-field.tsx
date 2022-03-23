import * as React from 'react';
import get from 'lodash/get';
import Text from '../../text';
import {
	orderProperties,
	retrieveSchema,
	getDefaultRegistry,
	canExpand,
	ADDITIONAL_PROPERTY_FLAG,
} from '../form.helpers';

/**
 *
 */
export function ObjectField<T extends object>({
	uiSchema,
	idSchema,
	idPrefix,
	formData,
	registry,
	name,
	onChange,
	...props
}: import('../types').FieldProps<T>): React.ReactElement {
	const { rootSchema, fields, formContext } = registry;
	const schema = retrieveSchema(props.schema, rootSchema, formData);
	// const title = schema.title === undefined ? props.name : schema.title;
	// const description = uiSchema['ui:description'] || schema.description;

	const { SchemaField } = fields;

	const orderedProperties = orderProperties(
		Object.keys(schema.properties || {}),
		get(uiSchema, 'ui:order')
	);

	return (
		<>
			<Text>{props.name}</Text>
			{orderedProperties.map((name) => {
				const fieldUiSchema = get(uiSchema, name);
				return (
					<SchemaField
						key={name}
						name={name}
						schema={schema.properties[name]}
						uiSchema={fieldUiSchema}
						idSchema={idSchema[name]}
						registry={registry}
						// idPrefix={idPrefix}
						formData={(formData || {})[name]}
						onChange={onChange}
					/>
				);
			})}
		</>
	);
}
