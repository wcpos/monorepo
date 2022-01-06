import * as React from 'react';
import { toIdSchema } from './utils';

interface FormProps {
	schema: any;
	uiSchema: any;
	formData: any;
}

export const Form = ({ schema, uiSchema, formData }: FormProps) => {
	console.log(toIdSchema(schema, 'root', schema, formData));
	return null;
};
