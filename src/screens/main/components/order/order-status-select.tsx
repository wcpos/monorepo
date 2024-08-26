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

interface OrderStatusSelectProps {
	value?: string;
	onChange?: (value: string) => void;
	[key: string]: any;
}

/**
 *
 */
export const OrderStatusSelect = React.forwardRef<
	React.ElementRef<typeof Select>,
	OrderStatusSelectProps
>((props, ref) => {
	const t = useT();
	const { items } = useOrderStatusLabel();

	return (
		<Select ref={ref} {...props}>
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
