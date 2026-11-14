import * as React from 'react';

import { useFormControlAria } from './aria';
import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
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
	const { itemNativeID, labelNativeID, ariaProps } = useFormControlAria({
		label,
		description,
		onLabelPress: handleOnLabelPress,
	});

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

	// Text in, text out: a number a person types is an amount field's (`FormAmountField`), never parsed here.
	function handleChangeText(text: string | number | undefined) {
		onChange?.(text != null ? String(text) : '');
	}

	return (
		<FormItem nativeID={itemNativeID}>
			{!!label && (
				<FormLabel nativeID={labelNativeID} onPress={handleOnLabelPress}>
					{label}
				</FormLabel>
			)}
			<Component
				ref={inputRef}
				{...ariaProps}
				onChangeText={handleChangeText}
				type={type}
				value={value != null ? String(value) : ''}
				{...props}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
