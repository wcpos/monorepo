import * as React from 'react';
import Text from '../../text';
import { SchemaField } from './schema-field';
import {
	orderProperties,
	retrieveSchema,
	getDefaultRegistry,
	canExpand,
	ADDITIONAL_PROPERTY_FLAG,
} from '../utils';

interface ObjectFieldProps {
	schema: any;
	uiSchema: any;
	formData: any;
	idSchema: any;
	name?: any;
}

export const ObjectField = ({
	uiSchema = {},
	formData = {},
	idSchema = {},
	...props
}: ObjectFieldProps) => {
	const { rootSchema, fields, formContext } = getDefaultRegistry();
	const schema = retrieveSchema(props.schema, rootSchema, formData);
	// const title = schema.title === undefined ? props.name : schema.title;
	// const description = uiSchema['ui:description'] || schema.description;
	const orderedProperties = orderProperties(
		Object.keys(schema.properties || {}),
		uiSchema['ui:order']
	);

	return (
		<>
			<Text>{props.name}</Text>
			{orderedProperties.map((name) => {
				const fieldUiSchema = uiSchema[name];
				return (
					<SchemaField
						key={name}
						name={name}
						schema={schema.properties[name]}
						uiSchema={fieldUiSchema}
						idSchema={idSchema[name]}
						// idPrefix={idPrefix}
						formData={(formData || {})[name]}
					/>
				);
			})}
		</>
	);
};
