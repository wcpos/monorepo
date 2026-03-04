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

import { useT } from '../../../../contexts/translations';

export function DiscountTypeSelect({ value, ...props }: React.ComponentProps<typeof Select>) {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();

	const options = React.useMemo(
		() => [
			{ label: t('coupons.percent'), value: 'percent' },
			{ label: t('coupons.fixed_cart'), value: 'fixed_cart' },
			{ label: t('coupons.fixed_product'), value: 'fixed_product' },
		],
		[t]
	);

	const label = options.find((option) => option.value === value?.value)?.label;

	return (
		<Select value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<SelectTrigger
				onLayout={(ev) => {
					setSelectTriggerWidth(ev.nativeEvent.layout.width);
				}}
			>
				<SelectValue placeholder={t('coupons.select_discount_type')} />
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
