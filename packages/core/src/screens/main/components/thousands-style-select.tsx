import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';

import { useAppState } from '../../../contexts/app-state';
import { useT } from '../../../contexts/translations';

/**
 *
 */
export function ThousandsStyleSelect({ value, ...props }: SelectSingleRootProps) {
	const t = useT();
	const { store } = useAppState();
	const price_thousand_sep = useObservableEagerState(store.price_thousand_sep$);

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
	const label = options.find((option) => option.value === value?.value)?.label;

	/**
	 *
	 */
	return (
		<Select value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue placeholder={t('common.select_thousands_style')} />
			</SelectTrigger>
			<SelectContent matchWidth>
				<SelectGroup>
					{options.map((option) => (
						<SelectItem key={option.value} label={option.label} value={option.value}>
							<Text>{option.label}</Text>
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
