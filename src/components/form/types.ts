type JSONSchema7 = import('json-schema').JSONSchema7;

type ErrorSchema = {
	[k: string]: ErrorSchema;
};

export interface FormProps<T> {
	acceptcharset?: string;
	action?: string;
	additionalMetaSchemas?: ReadonlyArray<object>;
	ArrayFieldTemplate?: React.FunctionComponent<ArrayFieldTemplateProps>;
	autoComplete?: string;
	autocomplete?: string; // deprecated
	children?: React.ReactNode;
	className?: string;
	customFormats?: { [k: string]: string | RegExp | ((data: string) => boolean) };
	disabled?: boolean;
	readonly?: boolean;
	hideError?: boolean;
	enctype?: string;
	extraErrors?: any;
	ErrorList?: React.FunctionComponent<ErrorListProps>;
	fields?: { [name: string]: Field };
	FieldTemplate?: React.FunctionComponent<FieldTemplateProps>;
	formContext?: any;
	formData?: T;
	id?: string;
	idPrefix?: string;
	idSeparator?: string;
	liveOmit?: boolean;
	liveValidate?: boolean;
	method?: string;
	name?: string;
	noHtml5Validate?: boolean;
	noValidate?: boolean;
	ObjectFieldTemplate?: React.FunctionComponent<ObjectFieldTemplateProps>;
	omitExtraData?: boolean;
	onBlur?: (id: string, value: any) => void;
	onChange?: (e: IChangeEvent<T>, es?: ErrorSchema) => any;
	onError?: (e: any) => any;
	onFocus?: (id: string, value: any) => void;
	onSubmit?: (e: ISubmitEvent<T>, nativeEvent: React.FormEvent<HTMLFormElement>) => any;
	schema: JSONSchema7;
	showErrorList?: boolean;
	tagName?: keyof JSX.IntrinsicElements | React.ComponentType;
	target?: string;
	transformErrors?: (errors: AjvError[]) => AjvError[];
	uiSchema?: UiSchema;
	validate?: (formData: T, errors: FormValidation) => FormValidation;
	widgets?: { [name: string]: Widget };
	/**
	 * WARNING: This exists for internal react-jsonschema-form purposes only. No guarantees of backwards
	 * compatibility. Use ONLY if you know what you are doing
	 */
	_internalFormWrapper?: React.ElementType;
}

export default class Form<T> extends React.Component<FormProps<T>> {
	validate: (
		formData: T,
		schema?: FormProps<T>['schema'],
		additionalMetaSchemas?: FormProps<T>['additionalMetaSchemas'],
		customFormats?: FormProps<T>['customFormats']
	) => { errors: AjvError[]; errorSchema: ErrorSchema };

	onChange: (formData: T, newErrorSchema: ErrorSchema) => void;
	onBlur: (id: string, value: any) => void;
	submit: () => void;
}

export type UiSchema = {
	'ui:field'?: Field | string;
	'ui:widget'?: Widget | string;
	'ui:options'?: { [key: string]: boolean | number | string | object | any[] | null };
	'ui:order'?: string[];
	'ui:FieldTemplate'?: React.FunctionComponent<FieldTemplateProps>;
	'ui:ArrayFieldTemplate'?: React.FunctionComponent<ArrayFieldTemplateProps>;
	'ui:ObjectFieldTemplate'?: React.FunctionComponent<ObjectFieldTemplateProps>;
	[name: string]: any;
};

export type FieldId = {
	$id: string;
};

export type IdSchema<T = any> = {
	[key in keyof T]: IdSchema<T[key]>;
} & FieldId;

export interface WidgetProps
	extends Pick<
		React.HTMLAttributes<HTMLElement>,
		Exclude<keyof React.HTMLAttributes<HTMLElement>, 'onBlur' | 'onFocus'>
	> {
	id: string;
	schema: JSONSchema7;
	uiSchema: UiSchema;
	value: any;
	required: boolean;
	disabled: boolean;
	readonly: boolean;
	autofocus: boolean;
	placeholder: string;
	onChange: (value: any) => void;
	options: NonNullable<UiSchema['ui:options']>;
	formContext: any;
	onBlur: (id: string, value: any) => void;
	onFocus: (id: string, value: any) => void;
	label: string;
	multiple: boolean;
	rawErrors: string[];
	registry: Registry;
	[prop: string]: any; // Allow for other props
}

export type Widget = React.FunctionComponent<WidgetProps>;

export interface Registry {
	fields: { [name: string]: Field };
	widgets: { [name: string]: Widget };
	definitions: { [name: string]: any };
	formContext: any;
	rootSchema: JSONSchema7;
}

export interface FieldProps<T = any>
	extends Pick<
		React.HTMLAttributes<HTMLElement>,
		Exclude<keyof React.HTMLAttributes<HTMLElement>, 'onBlur' | 'onFocus'>
	> {
	schema: JSONSchema7;
	uiSchema: UiSchema;
	idSchema: IdSchema;
	formData: T;
	errorSchema: ErrorSchema;
	onChange: (e: IChangeEvent<T> | any, es?: ErrorSchema) => any;
	onBlur: (id: string, value: any) => void;
	onFocus: (id: string, value: any) => void;
	registry: Registry;
	formContext?: any;
	autofocus: boolean;
	disabled: boolean;
	readonly: boolean;
	required: boolean;
	name: string;
	[prop: string]: any; // Allow for other props
}

export type Field = React.FunctionComponent<FieldProps>;

export type FieldTemplateProps<T = any> = {
	id: string;
	classNames: string;
	label: string;
	description: React.ReactElement;
	rawDescription: string;
	children: React.ReactElement;
	errors: React.ReactElement;
	rawErrors: string[];
	help: React.ReactElement;
	rawHelp: string;
	hidden: boolean;
	required: boolean;
	readonly: boolean;
	disabled: boolean;
	displayLabel: boolean;
	fields: Field[];
	schema: JSONSchema7;
	uiSchema: UiSchema;
	formContext: any;
	formData: T;
	onChange: (value: T) => void;
	onKeyChange: (value: string) => () => void;
	onDropPropertyClick: (value: string) => () => void;
	registry: Registry;
};

export type ArrayFieldItemProps = {
	children: React.ReactElement;
	className: string;
	disabled: boolean;
	hasMoveDown: boolean;
	hasMoveUp: boolean;
	hasRemove: boolean;
	hasToolbar: boolean;
	index: number;
	onAddIndexClick: (index: number) => (event?: any) => void;
	onDropIndexClick: (index: number) => (event?: any) => void;
	onReorderClick: (index: number, newIndex: number) => (event?: any) => void;
	readonly: boolean;
	key: string;
};

export type ArrayFieldTemplateProps<T = any> = {
	DescriptionField: React.FunctionComponent<{
		id: string;
		description: string | React.ReactElement;
	}>;
	TitleField: React.FunctionComponent<{ id: string; title: string; required: boolean }>;
	canAdd: boolean;
	className: string;
	disabled: boolean;
	idSchema: IdSchema;
	items: ArrayFieldItemProps[];
	onAddClick: (event?: any) => void;
	readonly: boolean;
	required: boolean;
	schema: JSONSchema7;
	uiSchema: UiSchema;
	title: string;
	formContext: any;
	formData: T;
	registry: Registry;
};

export type ObjectFieldTemplateProps<T = any> = {
	DescriptionField: React.FunctionComponent<{
		id: string;
		description: string | React.ReactElement;
	}>;
	TitleField: React.FunctionComponent<{ id: string; title: string; required: boolean }>;
	title: string;
	description: string;
	disabled: boolean;
	properties: {
		content: React.ReactElement;
		name: string;
		disabled: boolean;
		readonly: boolean;
		hidden: boolean;
	}[];
	onAddClick: (schema: JSONSchema7) => () => void;
	readonly: boolean;
	required: boolean;
	schema: JSONSchema7;
	uiSchema: UiSchema;
	idSchema: IdSchema;
	formData: T;
	formContext: any;
	registry: Registry;
};

export type AjvError = {
	message: string;
	name: string;
	params: any;
	property: string;
	stack: string;
};

export type ErrorListProps = {
	errorSchema: FormValidation;
	errors: AjvError[];
	formContext: any;
	schema: JSONSchema7;
	uiSchema: UiSchema;
};

export interface IChangeEvent<T = any> {
	edit: boolean;
	formData: T;
	errors: AjvError[];
	errorSchema: FormValidation;
	idSchema: IdSchema;
	schema: JSONSchema7;
	uiSchema: UiSchema;
	status?: string;
}

export type ISubmitEvent<T> = IChangeEvent<T>;

export type FieldError = string;

type FieldValidation = {
	__errors: FieldError[];
	addError: (message: string) => void;
};

type FormValidation = FieldValidation & {
	[fieldName: string]: FieldValidation;
};
