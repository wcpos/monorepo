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

import { useT } from '../../../../../contexts/translations';

export function ConnectionTypeSelect({ value, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() => [
			{ value: 'network', label: t('settings.connection_network', 'Network (TCP/IP)') },
			{ value: 'system', label: t('settings.connection_system', 'System Dialog') },
		],
		[t]
	);

	const label = options.find((option) => option.value === value?.value)?.label;

	return (
		<Select value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue placeholder={t('settings.select_connection_type', 'Select connection type')} />
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
