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

export function DrawerConnectorSelect({ value, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() => [
			{ value: 'pin2', label: 'Pin 2 / Drawer 1' },
			{ value: 'pin5', label: 'Pin 5 / Drawer 2' },
		],
		[]
	);

	const selectedLabel =
		options.find((option) => option.value === value?.value)?.label ??
		value?.label ??
		value?.value ??
		'';

	return (
		<Select value={value ? { ...value, label: selectedLabel } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue
					placeholder={t('settings.select_drawer_connector', 'Select drawer connector')}
				/>
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
