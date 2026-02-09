import * as React from 'react';

import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { useFormField } from './context';
import { Input } from '../input';

import type { FormItemProps } from './common';

export function FormInput({
	label,
	description,
	value,
	onChange,
	customComponent: Component = Input,
	type = 'text',
	ref,
	...props
}: FormItemProps<string | number> &
	Omit<Partial<React.ComponentProps<typeof Input>>, 'value' | 'onChangeText'>) {
	const inputRef = React.useRef<React.ComponentRef<typeof Input>>(null);
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	React.useImperativeHandle(ref, () => {
		if (!inputRef.current) {
			return {} as React.ComponentRef<typeof Input>;
		}
		return inputRef.current;
	}, []);

	function handleOnLabelPress() {
		if (!inputRef.current) {
			return;
		}
		if (inputRef.current.isFocused()) {
			inputRef.current?.blur();
		} else {
			inputRef.current?.focus();
		}
	}

	/**
	 * There are cases where we want the FormInput to control a numeric value, eg: Numpad
	 * in these cases we should take and emit a number, this prevents confusion with numeric strings
	 * which could be in alternate formats, eg: 1.000,00
	 */
	const normalizedValue = React.useMemo(() => {
		if (type === 'numeric' || type === 'decimal' || type === 'numbers') {
			const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
			return isNaN(numericValue) ? '0' : String(numericValue);
		}
		// For other types, ensure the value is a string
		return value !== null && value !== undefined ? String(value) : '';
	}, [value, type]);

	/**
	 * Again, to prevent confusion, we should emit a number for numeric types
	 * NOTE: The Component can be anything here, eg: Numpad
	 */
	function handleChangeText(text: string | number | undefined) {
		if (type === 'numeric' || type === 'decimal' || type === 'numbers') {
			let numericValue = 0;

			if (typeof text === 'number') {
				numericValue = isNaN(text) ? 0 : text;
			} else if (typeof text === 'string') {
				const cleanedText = text.replace(/[^0-9.]/g, '');
				const parsedValue = parseFloat(cleanedText);
				numericValue = isNaN(parsedValue) ? 0 : parsedValue;
			}

			onChange && onChange(numericValue);
		} else {
			const finalText = text !== undefined && text !== null ? String(text) : '';
			onChange && onChange(finalText);
		}
	}

	return (
		<FormItem>
			{!!label && (
				<FormLabel nativeID={formItemNativeID} onPress={handleOnLabelPress}>
					{label}
				</FormLabel>
			)}
			<Component
				ref={inputRef}
				aria-labelledby={formItemNativeID}
				aria-describedby={
					!error
						? `${formDescriptionNativeID}`
						: `${formDescriptionNativeID} ${formMessageNativeID}`
				}
				aria-invalid={!!error}
				onChangeText={handleChangeText}
				type={type}
				value={normalizedValue}
				{...props}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
