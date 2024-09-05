import * as React from 'react';

import { FormItem, FormLabel, FormDescription, FormMessage, FormItemProps } from './common';
import { useFormField } from './context';
import { Command } from '../command';

/**
 *
 */
const FormCombobox = React.forwardRef<
	React.ElementRef<typeof Command>,
	Omit<FormItemProps<typeof Command, string>, 'onValueChange'>
>(
	(
		{ label, description, onChange, value, customComponent: Component = Command, ...props },
		ref
	) => {
		const [open, setOpen] = React.useState(false);
		const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } =
			useFormField();

		return (
			<FormItem>
				{!!label && <FormLabel nativeID={formItemNativeID}>{label}</FormLabel>}
				<Component
					ref={ref}
					aria-labelledby={formItemNativeID}
					aria-describedby={
						!error
							? `${formDescriptionNativeID}`
							: `${formDescriptionNativeID} ${formMessageNativeID}`
					}
					aria-invalid={!!error}
					open={open}
					onOpenChange={setOpen}
					value={value}
					onValueChange={(val: string) => onChange?.(val || '')}
					{...props}
				/>
				{!!description && <FormDescription>{description}</FormDescription>}
				<FormMessage />
			</FormItem>
		);
	}
);

FormCombobox.displayName = 'FormCombobox';

export { FormCombobox };
