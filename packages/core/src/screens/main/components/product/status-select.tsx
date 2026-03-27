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

import { useT } from '../../../../contexts/translations';

/**
 *
 */
export function ProductStatusSelect({ value, ...props }: SelectSingleRootProps) {
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
	const label = options.find((option) => option.value === value?.value)?.label;

	/**
	 *
	 */
	return (
		<Select value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue placeholder={t('common.select_status')} />
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
