import * as React from 'react';
import Text from '../../text';
import { ObjectField } from './object-field';
import { StringField } from './string-field';
import {
	getSchemaType,
	orderProperties,
	retrieveSchema,
	getDefaultRegistry,
	canExpand,
	ADDITIONAL_PROPERTY_FLAG,
} from '../utils';

const COMPONENT_TYPES = {
	array: StringField,
	boolean: StringField,
	integer: StringField,
	number: StringField,
	object: ObjectField,
	string: StringField,
	null: StringField,
};

interface SchemaFieldProps {
	schema: any;
	uiSchema: any;
	idSchema: any;
	idPrefix?: any;
	formContext?: any;
	formData: any;
	registry: any;
	name: any;
}

export const SchemaField = ({
	schema,
	uiSchema,
	idSchema,
	idPrefix,
	formContext,
	formData,
	registry,
	name,
}: SchemaFieldProps) => {
	const { rootSchema, fields } = registry || getDefaultRegistry();
	const FieldComponent = COMPONENT_TYPES[getSchemaType(schema)];

	return (
		<FieldComponent
			schema={schema}
			uiSchema={uiSchema}
			idSchema={idSchema}
			formData={formData}
			name={name}
		/>
	);
};
