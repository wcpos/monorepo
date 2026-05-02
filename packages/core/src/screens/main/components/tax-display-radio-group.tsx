import * as React from 'react';

import { RadioGroup, RadioGroupOption } from '@wcpos/components/radio-group';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export function TaxDisplayRadioGroup(
	props: React.ComponentProps<typeof RadioGroup> & { name: string }
) {
	const t = useT();

	/**
	 *
	 */
	return (
		<RadioGroup {...props}>
			{[
				{ label: t('common.as_a_single_total'), value: 'single' },
				{ label: t('common.itemized'), value: 'itemized' },
			].map((option) => {
				return <RadioGroupOption key={option.value} value={option.value} label={option.label} />;
			})}
		</RadioGroup>
	);
}
