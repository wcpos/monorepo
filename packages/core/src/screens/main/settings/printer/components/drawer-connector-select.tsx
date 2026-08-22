import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../../../contexts/translations';

export function DrawerConnectorSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() => [
			{ value: 'pin2', label: t('settings.drawer_pin2') },
			{ value: 'pin5', label: t('settings.drawer_pin5') },
		],
		[t]
	);

	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('settings.select_drawer_connector')}
			fallbackLabel={value?.label ?? value?.value ?? ''}
			matchWidth
			{...props}
		/>
	);
}
