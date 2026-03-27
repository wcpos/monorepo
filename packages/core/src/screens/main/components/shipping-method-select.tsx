import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

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
import { useExtraData } from '../contexts/extra-data';

/**
 *
 */
export function ShippingMethodSelect({ value, ...props }: SelectSingleRootProps) {
	const { extraData } = useExtraData();
	const shippingMethods = useObservableEagerState(extraData.shippingMethods$);
	const t = useT();

	/**
	 *
	 */
	const options = React.useMemo(() => {
		return ((shippingMethods as { id: string; title: string }[]) || []).map(
			(method: { id: string; title: string }) => ({
				label: method.title,
				value: method.id,
			})
		);
	}, [shippingMethods]);

	/**
	 *
	 */
	const label = options.find(
		(option: { value: string; label: string }) => option.value === value?.value
	)?.label;

	/**
	 *
	 */
	return (
		<Select value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue placeholder={t('common.select_shipping_method')} />
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
