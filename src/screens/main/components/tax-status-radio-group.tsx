import * as React from 'react';

import { useFormContext } from 'react-hook-form';

import type { FormItemProps } from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { Label } from '@wcpos/components/src/label';
import { RadioGroup, RadioGroupItem } from '@wcpos/components/src/radio-group';

/**
 *
 */
export const TaxStatusRadioGroup = React.forwardRef<
	React.ElementRef<typeof RadioGroup>,
	Omit<FormItemProps<typeof RadioGroup, string>, 'onValueChange'>
>(({ value, onChange, ...props }, ref) => {
	const { setValue } = useFormContext(); // Access form methods

	const onLabelPress = React.useCallback(
		(label: 'taxable' | 'none') => {
			return () => {
				setValue('tax_status', label);
			};
		},
		[setValue]
	);

	/**
	 *
	 */
	return (
		<RadioGroup ref={ref} onValueChange={onChange} value={value} {...props}>
			{(['taxable', 'none'] as const).map((value) => {
				return (
					<HStack key={value} className="gap-3">
						<RadioGroupItem aria-labelledby={`label-for-${value}`} value={value} />
						<Label
							nativeID={`label-for-${value}`}
							className="capitalize"
							onPress={onLabelPress(value)}
						>
							{value}
						</Label>
					</HStack>
				);
			})}
		</RadioGroup>
	);
});
