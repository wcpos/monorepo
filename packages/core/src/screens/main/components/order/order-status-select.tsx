import * as React from 'react';

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@wcpos/components/src/select';

import { useT } from '../../../../contexts/translations';
import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

/**
 *
 */
export const OrderStatusSelect = React.forwardRef<
	React.ElementRef<typeof Select>,
	React.ComponentPropsWithoutRef<typeof Select>
>(({ value, ...props }, ref) => {
	const t = useT();
	const { items } = useOrderStatusLabel();

	const label = items.find((item) => item.value === value?.value)?.label;

	return (
		<Select ref={ref} value={{ ...value, label }} {...props}>
			<SelectTrigger>
				<SelectValue
					className="text-foreground text-sm native:text-lg"
					placeholder={t('Select Status', { _tags: 'core' })}
				/>
			</SelectTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.label} label={item.label} value={item.value} />
				))}
			</SelectContent>
		</Select>
	);
});

OrderStatusSelect.displayName = 'OrderStatusSelect';
