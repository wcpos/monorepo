import * as React from 'react';
import { TextInput } from 'react-native';

import { useFormControlAria } from './aria';
import { FormDescription, FormItem, FormLabel, FormMessage } from './common';
import { Textarea } from '../textarea';

import type { FormItemProps } from './common';

export function FormTextarea({
	label,
	description,
	onChange,
	customComponent: Component = Textarea,
	ref,
	...props
}: FormItemProps<string> &
	Partial<React.ComponentProps<typeof Textarea>> & { ref?: React.Ref<TextInput> }) {
	const textareaRef = React.useRef<TextInput>(null);
	const { labelNativeID, ariaProps } = useFormControlAria({ label, description });

	React.useImperativeHandle(ref, () => {
		if (!textareaRef.current) {
			return {} as TextInput;
		}
		return textareaRef.current;
	}, []);

	function handleOnLabelPress() {
		if (!textareaRef.current) {
			return;
		}
		if (textareaRef.current.isFocused()) {
			textareaRef.current.blur();
		} else {
			textareaRef.current.focus();
		}
	}

	return (
		<FormItem>
			{!!label && (
				<FormLabel nativeID={labelNativeID} onPress={handleOnLabelPress}>
					{label}
				</FormLabel>
			)}

			<Component ref={textareaRef} {...ariaProps} onChangeText={onChange} {...props} />
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
}
