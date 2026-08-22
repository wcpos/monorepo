import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../../contexts/translations';

/**
 *
 */
export function ProductStatusSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();

	/**
	 * Options
	 */
	const options = React.useMemo(
		() => [
			{ label: t('common.draft'), value: 'draft' },
			{ label: t('common.pending'), value: 'pending' },
			{ label: t('common.private'), value: 'private' },
			{ label: t('common.publish'), value: 'publish' },
		],
		[t]
	);

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
			placeholder={t('common.select_status')}
			fallbackLabel=""
			matchWidth
			{...props}
		/>
	);
}
