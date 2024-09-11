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
export const TaxDisplayRadioGroup = React.forwardRef<
	React.ElementRef<typeof RadioGroup>,
	Omit<FormItemProps<typeof RadioGroup, string>, 'type'>
>((props, ref) => {
	const t = useT();
	const { setValue } = useFormContext();

	/**
	 *
	 */
	return (
		<RadioGroup ref={ref} {...props}>
			{[
				{ label: t('As a single total', { _tags: 'core' }), value: 'single' },
				{ label: t('Itemized', { _tags: 'core' }), value: 'itemized' },
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
