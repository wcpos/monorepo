import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../contexts/translations';

/**
 *
 */
export function CurrencyPositionSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(() => {
		return [
			{ value: 'left', label: t('common.left') },
			{ value: 'right', label: t('common.right') },
			{ value: 'left_space', label: t('common.left_with_space') },
			{ value: 'right_space', label: t('common.right_with_space') },
		];
	}, [t]);

	/**
	 *
	 */

	/**
	 *
	 */
	return (
		<OptionSelect
			options={options}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('common.select_a_currency_position')}
			fallbackLabel=""
			matchWidth
			{...props}
		/>
	);
}
