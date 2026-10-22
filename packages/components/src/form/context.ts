import * as React from 'react';

import { FieldPath, FieldValues, useFormContext } from 'react-hook-form';

type FormFieldContextValue<
	TFieldValues extends FieldValues = FieldValues,
	TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
	name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue>({} as FormFieldContextValue);

type FormItemContextValue = {
	nativeID: string;
};

const FormItemContext = React.createContext<FormItemContextValue>({} as FormItemContextValue);

/**
 * `itemNativeID` is for the one caller that sits ABOVE its `FormItem`: a field wrapper's
 * `useFormControlAria`, which mints the item id and hands the same id to its `FormItem`.
 */
const useFormField = (itemNativeID?: string) => {
	const fieldContext = React.useContext(FormFieldContext);
	const itemContext = React.useContext(FormItemContext);
	const { getFieldState, formState, handleSubmit } = useFormContext();

	const fieldState = getFieldState(fieldContext.name, formState);

	if (!fieldContext) {
		throw new Error('useFormField should be used within <FormField>');
	}

	const nativeID = itemNativeID ?? itemContext.nativeID;

	return {
		nativeID,
		name: fieldContext.name,
		formItemNativeID: `${nativeID}-form-item`,
		formDescriptionNativeID: `${nativeID}-form-item-description`,
		formMessageNativeID: `${nativeID}-form-item-message`,
		handleSubmit,
		...fieldState,
	};
};

export { FormFieldContext, FormItemContext, useFormField };
