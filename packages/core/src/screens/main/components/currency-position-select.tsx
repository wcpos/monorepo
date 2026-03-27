import * as React from 'react';

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

import { useT } from '../../../contexts/translations';

/**
 *
 */
export function CurrencyPositionSelect({ value, ...props }: SelectSingleRootProps) {
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
	const label = options.find((option) => option.value === value?.value)?.label;

	/**
	 *
	 */
	return (
		<Select value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue placeholder={t('common.select_a_currency_position')} />
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
