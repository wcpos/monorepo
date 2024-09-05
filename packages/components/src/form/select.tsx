import * as React from 'react';

import { FormItem, FormLabel, FormDescription, FormMessage, FormItemProps } from './common';
import { useFormField } from './context';
import { Select, Option } from '../select';

/**
 * NOTE: select is a bit different from the other form components
 * - the value will come in as a string and go out as a string, but
 * - the select component expects an object with value and label
 */
const FormSelect = React.forwardRef<
	React.ElementRef<typeof Select>,
	Omit<FormItemProps<typeof Select, string>, 'onValueChange'>
>(({ label, description, onChange, value, customComponent: Component = Select, ...props }, ref) => {
	const [open, setOpen] = React.useState(false);
	const { error, formItemNativeID, formDescriptionNativeID, formMessageNativeID } = useFormField();

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
				// value={value ? { label: value?.label ?? '', value: value?.label ?? '' } : undefined}
				value={value ? { value } : undefined}
				onValueChange={(val: Option) => onChange?.(val?.value || '')}
				{...props}
			/>
			{!!description && <FormDescription>{description}</FormDescription>}
			<FormMessage />
		</FormItem>
	);
});

FormSelect.displayName = 'FormSelect';

export { FormSelect };
