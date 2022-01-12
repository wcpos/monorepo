import * as React from 'react';
import Box from '../../box';
import { ArrayField } from './array-field';
import { BooleanField } from './boolean-field';
import { IntegerField } from './integer-field';
import { NumberField } from './number-field';
import { ObjectField } from './object-field';
import { StringField } from './string-field';
import { NullField } from './null-field';
import {
	getSchemaType,
	orderProperties,
	retrieveSchema,
	getDefaultRegistry,
	canExpand,
	ADDITIONAL_PROPERTY_FLAG,
} from '../utils';

const COMPONENT_TYPES = {
	array: ArrayField,
	boolean: BooleanField,
	integer: IntegerField,
	number: NumberField,
	object: ObjectField,
	string: StringField,
	null: NullField,
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
		<Box paddingBottom="small">
			<FieldComponent
				schema={schema}
				uiSchema={uiSchema}
				idSchema={idSchema}
				formData={formData}
				name={name}
			/>
		</Box>
	);
};
