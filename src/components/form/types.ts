type JSONSchema7 = import('json-schema').JSONSchema7;

export type Schema = JSONSchema7;

export type UiSchema = {
	[name: string]: any;
};

export type ErrorSchema = {
	[k: string]: ErrorSchema;
};
