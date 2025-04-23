import * as React from 'react';

import { useFormContext } from 'react-hook-form';

import { HStack } from '@wcpos/components/hstack';
import { Label } from '@wcpos/components/label';
import { RadioGroup, RadioGroupItem } from '@wcpos/components/radio-group';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export const TaxStatusRadioGroup = (props: React.ComponentProps<typeof RadioGroup>) => {
	const { setValue } = useFormContext();
	const t = useT();

	/**
	 *
	 */
	return (
		<RadioGroup {...props}>
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
};
