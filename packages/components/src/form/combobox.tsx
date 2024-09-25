import * as React from 'react';

import { FormItem, FormLabel, FormDescription, FormMessage } from './common';
import { useFormField } from './context';
import { Command } from '../command';

import type { FormItemProps } from './common';

/**
 * NOTE: combobox is a bit different from the other form components
 * - the value will come in as a string and go out as a string, but
 * - the combobox component expects an object with value and label
 */
const FormCombobox = React.forwardRef<
	React.ElementRef<typeof Command>,
	Omit<FormItemProps<typeof Command, string>, 'onValueChange'>
>(
	(
		{ label, description, value, onChange, customComponent: Component = Command, ...props },
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
					value={typeof value === 'string' ? { value, label: value } : value}
					onValueChange={(val: any) => onChange?.(val?.value || '')}
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
