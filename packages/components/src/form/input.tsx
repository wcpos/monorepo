import * as React from 'react';

import { FormItem, FormLabel, FormDescription, FormMessage } from './common';
import { useFormField } from './context';
import { Input } from '../input';

import type { FormItemProps } from './common';

const FormInput = React.forwardRef<
	React.ElementRef<typeof Input>,
	FormItemProps<typeof Input, string | number>
>(
	(
		{ label, description, onChange, customComponent: Component = Input, type = 'text', ...props },
		ref
	) => {
		const inputRef = React.useRef<React.ComponentRef<typeof Input>>(null);
		const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } =
			useFormField();

		React.useImperativeHandle(ref, () => {
			if (!inputRef.current) {
				return {} as React.ComponentRef<typeof Input>;
			}
			return inputRef.current;
		}, [inputRef.current]);

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

		function handleChangeText(value: string) {
			if (type === 'numeric' || type === 'decimal') {
				const numericValue = parseFloat(value.replace(/[^0-9.]/g, ''));
				onChange && onChange(numericValue);
			} else {
				onChange && onChange(value);
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
					{...props}
				/>
				{!!description && <FormDescription>{description}</FormDescription>}
				<FormMessage />
			</FormItem>
		);
	}
);

FormInput.displayName = 'FormInput';

export { FormInput };
