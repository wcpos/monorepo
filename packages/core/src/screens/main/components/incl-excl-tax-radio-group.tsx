import * as React from 'react';

import { useFormContext } from 'react-hook-form';

import { HStack } from '@wcpos/components/hstack';
import { Label } from '@wcpos/components/label';
import { RadioGroup, RadioGroupItem } from '@wcpos/components/radio-group';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export function InclExclRadioGroup(
	props: React.ComponentProps<typeof RadioGroup> & { name: string }
) {
	const t = useT();
	const { setValue } = useFormContext();

	/**
	 *
	 */
	return (
		<RadioGroup {...props}>
			{[
				{ label: t('common.including_tax'), value: 'incl' },
				{ label: t('common.excluding_tax'), value: 'excl' },
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
}
