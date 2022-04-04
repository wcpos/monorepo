import * as React from 'react';
import forEach from 'lodash/forEach';
import cloneDeep from 'lodash/cloneDeep';
import set from 'lodash/set';
import { FormContextProvider } from './context';
import { ErrorList } from './error-list';
import { toErrorList } from './validate';
import { NodeTemplate } from './templates/node';
import { toIdSchema, getDefaultFormState, retrieveSchema } from './form.helpers';

import type { Schema, UiSchema, ErrorSchema } from './types';

export interface FormProps<T> {
	formData: T;
	schema: Schema;
	uiSchema?: UiSchema;
	extraErrors?: ErrorSchema;
	onChange: (formData: T) => void;
	rootId?: string;
}

/**
 *
 */
export const Form = <T extends object | string>({
	schema,
	uiSchema = {},
	formData: inputFormData,
	extraErrors = {},
	onChange,
	rootId = 'root',
	formContext,
	...props
}: FormProps<T>) => {
	const rootSchema = schema;
	const formData = Object.freeze(getDefaultFormState(schema, inputFormData, rootSchema));
	const retrievedSchema = retrieveSchema(schema, rootSchema, formData); // don't know why this is needed

	/**
	 *
	 */
	const idSchema = React.useMemo(
		() =>
			toIdSchema(
				retrievedSchema,
				uiSchema['ui:rootFieldId'],
				rootSchema,
				formData,
				rootId,
				props.idSeparator
			),
		[formData, props.idSeparator, retrievedSchema, rootId, rootSchema, uiSchema]
	);

	/**
	 *
	 */
	const errors = React.useMemo(() => toErrorList(extraErrors), [extraErrors]);

	/**
	 *
	 */
	const handleOnChange = React.useCallback(
		(changes) => {
			let newData = cloneDeep(formData);
			forEach(changes, (value, id) => {
				const path = id.split('.');
				const root = path.shift();
				if (path.length === 0 && root === rootId) {
					// single-field form
					newData = value;
				} else {
					set(newData, path, value);
				}
			});
			if (onChange) {
				onChange(newData);
			}
		},
		[formData, onChange, rootId]
	);

	/**
	 *
	 */
	return (
		<FormContextProvider schema={schema} onChange={handleOnChange} formContext={formContext}>
			{errors.length > 0 && <ErrorList errors={errors} />}
			<NodeTemplate
				schema={schema}
				formData={formData}
				name={rootId}
				idSchema={idSchema}
				uiSchema={uiSchema}
			/>
		</FormContextProvider>
	);
};
