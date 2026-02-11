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

import { useT } from '../../../contexts/translations';

/**
 *
 */
export function TaxBasedOnSelect({ value, ...props }: React.ComponentProps<typeof Select>) {
	const [selectTriggerWidth, setSelectTriggerWidth] = React.useState(0);
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(
		() => [
			{
				value: 'shipping',
				label: t('common.customer_shipping_address'),
			},
			{ value: 'billing', label: t('common.customer_billing_address') },
			{ value: 'base', label: t('common.shop_base_address') },
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
			<SelectTrigger
				onLayout={(ev) => {
					setSelectTriggerWidth(ev.nativeEvent.layout.width);
				}}
			>
				<SelectValue placeholder={t('common.select_tax_based_on')} />
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
