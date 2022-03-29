import * as React from 'react';
import { FormContextProvider } from './context';
import { ErrorList } from './error-list';
import { toErrorList } from './validate';
import { NodeTemplate } from './templates/node';

import type { Schema, UiSchema, ErrorSchema } from './types';

export interface FormProps<T> {
	formData: T;
	schema: Schema;
	uiSchema?: UiSchema;
	extraErrors?: ErrorSchema;
}

/**
 *
 */
export const Form = <T extends object>({
	schema,
	uiSchema = {},
	formData: inputFormData,
	extraErrors = {},
	...props
}: FormProps<T>) => {
	/**
	 *
	 */
	const errors = React.useMemo(() => {
		return toErrorList(extraErrors);
	}, [extraErrors]);

	/**
	 *
	 */
	return (
		<FormContextProvider schema={schema}>
			{errors.length > 0 && <ErrorList errors={errors} />}
			<NodeTemplate schema={schema} />
		</FormContextProvider>
	);
};
