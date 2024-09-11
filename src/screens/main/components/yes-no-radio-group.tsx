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
export const YesNoRadioGroup = React.forwardRef<
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
				{ label: t('Yes', { _tags: 'core' }), value: 'yes' },
				{ label: t('No', { _tags: 'core' }), value: 'no' },
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
