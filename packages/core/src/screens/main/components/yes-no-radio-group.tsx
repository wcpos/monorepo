import * as React from 'react';

import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export function YesNoRadioGroup(props: React.ComponentProps<typeof RadioGroup> & { name: string }) {
	const t = useT();

	/**
	 *
	 */
	return (
		<RadioGroup {...props}>
			{[
				{ label: t('common.yes'), value: 'yes' },
				{ label: t('common.no'), value: 'no' },
			].map((option) => {
				return <RadioGroupOption key={option.value} value={option.value} label={option.label} />;
			})}
		</RadioGroup>
	);
}
