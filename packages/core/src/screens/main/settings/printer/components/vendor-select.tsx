import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../../../contexts/translations';

import type { VendorOption } from '../schema';

interface VendorSelectProps extends SelectSingleRootProps {
	options: VendorOption[];
}

export function VendorSelect({ value, options, onValueChange, ...props }: VendorSelectProps) {
	const t = useT();
	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('settings.select_vendor')}
			fallbackLabel={value?.label ?? value?.value ?? ''}
			matchWidth
			{...props}
		/>
	);
}
