import * as React from 'react';

import { OptionSelect, type OptionSelectProps } from '@wcpos/components/select';

import { useT } from '../../../../contexts/translations';
import { useOrderStatusLabel } from '../../hooks/use-order-status-label';

/**
 * @param allowed - The statuses to offer; every store status when omitted. Order edit
 *   forms pass the pushable set plus the order's current status (ADR 0040 D4).
 */
export function OrderStatusSelect({
	allowed,
	...props
}: Omit<OptionSelectProps, 'options' | 'placeholder'> & { allowed?: readonly string[] }) {
	const t = useT();
	const { items } = useOrderStatusLabel();
	const options = React.useMemo(
		() => (allowed ? items.filter((item) => allowed.includes(item.value)) : items),
		[items, allowed]
	);

	return (
		<OptionSelect
			options={options}
			placeholder={t('common.select_status')}
			valueClassName="text-foreground text-sm"
			{...props}
		/>
	);
}
