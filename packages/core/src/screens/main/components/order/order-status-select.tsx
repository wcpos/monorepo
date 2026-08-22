import * as React from 'react';

import { OptionSelect } from '@wcpos/components/select';
import type { SelectSingleRootProps } from '@wcpos/components/select';

import { useT } from '../../../../contexts/translations';
import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

/**
 *
 */
export function OrderStatusSelect({ value, onValueChange, ...props }: SelectSingleRootProps) {
	const t = useT();
	const { items } = useOrderStatusLabel();

	return (
		<OptionSelect
			options={items}
			value={value?.value}
			onChange={(_nextValue, option) => onValueChange?.(option)}
			placeholder={t('common.select_status')}
			fallbackLabel=""
			valueClassName="text-foreground text-sm"
			{...props}
		/>
	);
}
