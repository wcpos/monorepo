import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';
import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';

export function VendorSelect({ value, ...props }: React.ComponentProps<typeof Select>) {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();

	const options = React.useMemo(
		() => [
			{ value: 'epson', label: 'Epson' },
			{ value: 'star', label: 'Star Micronics' },
			{
				value: 'generic',
				label: t('settings.printer_vendor_generic', 'Generic'),
			},
		],
		[t]
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
				<SelectValue placeholder={t('settings.select_vendor', 'Select vendor')} />
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
