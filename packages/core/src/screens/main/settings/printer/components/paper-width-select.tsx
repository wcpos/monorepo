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

export function PaperWidthSelect({ value, ...props }: SelectSingleRootProps) {
	const t = useT();

	const options = React.useMemo(
		() => [
			// This field stores printer character capacity (CPL), not physical paper width.
			// 80mm printers are commonly configured as either 42 or 48 columns, so expose both.
			{
				value: '42',
				label: t('settings.printer_width_80mm_standard', '80mm standard (42 chars)'),
			},
			{
				value: '48',
				label: t('settings.printer_width_80mm_wide', '80mm wide (48 chars)'),
			},
			{
				value: '32',
				label: t('settings.printer_width_58mm', '58mm (32 chars)'),
			},
		],
		[t]
	);

	const label = options.find((option) => option.value === value?.value)?.label;

	return (
		<Select value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue
					placeholder={t('settings.select_printer_text_width', 'Select printer text width')}
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
