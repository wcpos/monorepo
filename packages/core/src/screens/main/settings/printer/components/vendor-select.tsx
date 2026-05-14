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

import type { VendorOption } from '../schema';

interface VendorSelectProps extends SelectSingleRootProps {
	options: VendorOption[];
}

export function VendorSelect({ value, options, ...props }: VendorSelectProps) {
	const t = useT();
	const selectedLabel =
		options.find((o) => o.value === value?.value)?.label ?? value?.label ?? value?.value ?? '';
	return (
		<Select value={value ? { ...value, label: selectedLabel } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue placeholder={t('settings.select_vendor', 'Select vendor')} />
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
