import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../contexts/translations';

type CapabilityHint =
	'editProducts' | 'createCoupons' | 'editCoupons' | 'createCustomers' | 'editCustomers';

export function CapabilityTooltip({
	children,
	hint,
	show,
}: {
	children: React.ReactElement;
	hint: CapabilityHint;
	show: boolean;
}) {
	const t = useT();
	const messages: Record<CapabilityHint, string> = {
		editProducts: t('capability_hints.edit_products'),
		createCoupons: t('capability_hints.create_coupons'),
		editCoupons: t('capability_hints.edit_coupons'),
		createCustomers: t('capability_hints.create_customers'),
		editCustomers: t('capability_hints.edit_customers'),
	};

	if (!show) return children;

	return (
		<Tooltip showOnNative>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>
				<Text>{messages[hint]}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
