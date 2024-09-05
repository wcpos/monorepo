import * as React from 'react';

import { Controller, ControllerProps, FieldPath, FieldValues, FormProvider } from 'react-hook-form';

import { FormCheckbox } from './checkbox';
import { FormCombobox } from './combobox';
import { FormItem, FormLabel, FormDescription, FormMessage } from './common';
import { FormFieldContext, useFormField } from './context';
import { FormInput } from './input';
import { FormRadioGroup } from './radio-group';
import { FormSelect } from './select';
import { FormSwitch } from './switch';
import { FormTextarea } from './textarea';
import { useFormChangeHandler } from './use-form-change-handler';

const Form = FormProvider;

const FormField = <
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({
	...props
}: ControllerProps<TFieldValues, TName>) => {
	return (
		<FormFieldContext.Provider value={{ name: props.name }}>
			<Controller {...props} />
		</FormFieldContext.Provider>
	);
};

export {
	Form,
	FormCheckbox,
	FormCombobox,
	// FormDatePicker,
	FormDescription,
	FormField,
	FormInput,
	FormItem,
	FormLabel,
	FormMessage,
	FormRadioGroup,
	FormSelect,
	FormSwitch,
	FormTextarea,
	useFormField,
	useFormChangeHandler,
};
