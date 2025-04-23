import * as React from 'react';

import { useFormContext } from 'react-hook-form';

import type { FormItemProps } from '@wcpos/components/form';
import { HStack } from '@wcpos/components/hstack';
import { Label } from '@wcpos/components/label';
import { RadioGroup, RadioGroupItem } from '@wcpos/components/radio-group';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export const InclExclRadioGroup = (props: React.ComponentProps<typeof RadioGroup>) => {
	const t = useT();
	const { setValue } = useFormContext();

	/**
	 *
	 */
	return (
		<RadioGroup {...props}>
			{[
				{ label: t('Including tax', { _tags: 'core' }), value: 'incl' },
				{ label: t('Excluding tax', { _tags: 'core' }), value: 'excl' },
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
};
