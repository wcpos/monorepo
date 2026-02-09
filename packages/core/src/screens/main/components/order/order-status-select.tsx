import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/select';

import { useT } from '../../../../contexts/translations';
import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

/**
 *
 */
export const OrderStatusSelect = ({ value, ...props }: React.ComponentProps<typeof Select>) => {
	const t = useT();
	const { items } = useOrderStatusLabel();

	const label = items.find(
		(item: { value: string; label: string }) => item.value === value?.value
	)?.label;

	return (
		<Select value={value ? { ...value, label: label ?? '' } : undefined} {...props}>
			<SelectTrigger>
				<SelectValue className="text-foreground text-sm" placeholder={t('common.select_status')} />
			</SelectTrigger>
			<SelectContent>
				{items.map((item: { value: string; label: string }) => (
					<SelectItem key={item.label} label={item.label} value={item.value} />
				))}
			</SelectContent>
		</Select>
	);
};
