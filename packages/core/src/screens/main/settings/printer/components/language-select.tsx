import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../../../contexts/translations';

export function LanguageSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() => [
			{ value: 'esc-pos', label: 'ESC/POS' },
			{ value: 'star-prnt', label: 'StarPRNT' },
			{ value: 'star-line', label: 'Star Line Mode' },
		],
		[]
	);

	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('settings.select_language')}
			fallbackLabel={value?.label ?? value?.value ?? ''}
			matchWidth
			{...props}
		/>
	);
}
