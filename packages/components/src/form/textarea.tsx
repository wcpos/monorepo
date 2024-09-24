import * as React from 'react';

import { FormItem, FormLabel, FormDescription, FormMessage } from './common';
import { useFormField } from './context';
import { Textarea } from '../textarea';

import type { FormItemProps } from './common';

const FormTextarea = React.forwardRef<
	React.ElementRef<typeof Textarea>,
	FormItemProps<typeof Textarea, string>
>(({ label, description, onChange, customComponent: Component = Textarea, ...props }, ref) => {
	const textareaRef = React.useRef<React.ComponentRef<typeof Textarea>>(null);
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

	React.useImperativeHandle(ref, () => {
		if (!textareaRef.current) {
			return {} as React.ComponentRef<typeof Textarea>;
		}
		return textareaRef.current;
	}, [textareaRef.current]);

	function handleOnLabelPress() {
		if (!textareaRef.current) {
			return;
		}
		if (textareaRef.current.isFocused()) {
			textareaRef.current?.blur();
		} else {
			textareaRef.current?.focus();
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
				ref={textareaRef}
				aria-labelledby={formItemNativeID}
				aria-describedby={
					!error
						? `${formDescriptionNativeID}`
						: `${formDescriptionNativeID} ${formMessageNativeID}`
				}
				aria-invalid={!!error}
				onChangeText={onChange}
				{...props}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
});

FormTextarea.displayName = 'FormTextarea';

export { FormTextarea };
