import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../../contexts/translations';

export function StatusSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() => [
			{ label: t('coupons.active'), value: 'publish' },
			{ label: t('coupons.draft'), value: 'draft' },
			{ label: t('coupons.pending'), value: 'pending' },
		],
		[t]
	);

	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('coupons.select_status')}
			fallbackLabel=""
			matchWidth
			{...props}
		/>
	);
}
