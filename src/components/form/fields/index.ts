import { ArrayField } from './array-field';
import { BooleanField } from './boolean-field';
import { DescriptionField } from './description-field';
import { MultiSchemaField } from './multi-schema-field';
import { NumberField } from './number-field';
import { ObjectField } from './object-field';
import { SchemaField } from './schema-field';
import { StringField } from './string-field';
import { TitleField } from './title-field';
import { NullField } from './null-field';
import { UnsupportedField } from './unsupported-field';

export default {
	AnyOfField: MultiSchemaField,
	ArrayField,
	BooleanField,
	DescriptionField,
	NumberField,
	ObjectField,
	OneOfField: MultiSchemaField,
	SchemaField,
	StringField,
	TitleField,
	NullField,
	UnsupportedField,
};
