import * as React from 'react';

import { useFormContext } from 'react-hook-form';

import type { FormItemProps } from '@wcpos/components/src/form';
import { HStack } from '@wcpos/components/src/hstack';
import { Label } from '@wcpos/components/src/label';
import { RadioGroup, RadioGroupItem } from '@wcpos/components/src/radio-group';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export const TaxStatusRadioGroup = React.forwardRef<
	React.ElementRef<typeof RadioGroup>,
	Omit<FormItemProps<typeof RadioGroup, string>, 'type'>
>((props, ref) => {
	const { setValue } = useFormContext();
	const t = useT();

	/**
	 *
	 */
	return (
		<RadioGroup ref={ref} {...props}>
			{[
				{ label: t('Taxable', { _tags: 'core' }), value: 'taxable' },
				{ label: t('None', { _tags: 'core' }), value: 'none' },
			].map((option) => {
				return (
					<HStack key={option.value}>
						<RadioGroupItem aria-labelledby={`label-for-${option.value}`} value={option.value} />
						<Label
							nativeID={`label-for-${option.value}`}
							onPress={() => setValue(props.name, option.value)}
						>
							{option.label}
						</Label>
					</HStack>
				);
			})}
		</RadioGroup>
	);
});
