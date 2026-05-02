import * as React from 'react';

import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export function InclExclRadioGroup(
	props: React.ComponentProps<typeof RadioGroup> & { name: string }
) {
	const t = useT();

	/**
	 *
	 */
	return (
		<RadioGroup {...props}>
			{[
				{ label: t('common.including_tax'), value: 'incl' },
				{ label: t('common.excluding_tax'), value: 'excl' },
			].map((option) => {
				return <RadioGroupOption key={option.value} value={option.value} label={option.label} />;
			})}
		</RadioGroup>
	);
}
