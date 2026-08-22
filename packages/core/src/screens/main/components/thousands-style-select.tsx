import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';
import { useDocField } from '@wcpos/query';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export function ThousandsStyleSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();
	const { store } = useAppState();
	const price_thousand_sep = useDocField(store, (value) => value.price_thousand_sep);

	/**
	 * Use price_thousand_sep from store for formatting examples
	 */
	const options = React.useMemo(
		() => [
			{
				value: 'thousand',
				label: `123${price_thousand_sep}456${price_thousand_sep}789`,
			},
			{
				value: 'lakh',
				label: `12${price_thousand_sep}34${price_thousand_sep}56${price_thousand_sep}789`,
			},
			{ value: 'wan', label: `1${price_thousand_sep}2345${price_thousand_sep}6789` },
		],
		[price_thousand_sep]
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
			placeholder={t('common.select_thousands_style')}
			fallbackLabel=""
			matchWidth
			{...props}
		/>
	);
}
