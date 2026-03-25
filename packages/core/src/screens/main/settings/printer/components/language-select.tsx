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

export function LanguageSelect({ value, ...props }: SelectSingleRootProps) {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();

	const options = React.useMemo(
		() => [
			{ value: 'esc-pos', label: 'ESC/POS' },
			{ value: 'star-prnt', label: 'StarPRNT' },
			{ value: 'star-line', label: 'Star Line Mode' },
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
			<SelectTrigger
				onLayout={(ev) => {
					setSelectTriggerWidth(ev.nativeEvent.layout.width);
				}}
			>
				<SelectValue placeholder={t('settings.select_language', 'Select printer language')} />
			</SelectTrigger>
			<SelectContent style={{ width: selectTriggerWidth }}>
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
