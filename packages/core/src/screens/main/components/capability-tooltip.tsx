import * as React from 'react';
import { View } from 'react-native';

import { Text } from '@wcpos/components/text';
import { Tooltip, TooltipContent, TooltipTrigger } from '@wcpos/components/tooltip';

import { useT } from '../../../contexts/translations';

type CapabilityHint =
	'editProducts' | 'createCoupons' | 'editCoupons' | 'createCustomers' | 'editCustomers';

export function CapabilityTooltipTrigger({ children }: { children: React.ReactElement }) {
	return (
		<TooltipTrigger asChild>
			<View role="none">{children}</View>
		</TooltipTrigger>
	);
}

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
		editProducts: t('capability_hints.edit_products_admin_path'),
		createCoupons: t('capability_hints.create_coupons_admin_path'),
		editCoupons: t('capability_hints.edit_coupons_admin_path'),
		createCustomers: t('capability_hints.create_customers_admin_path'),
		editCustomers: t('capability_hints.edit_customers_admin_path'),
	};

	if (!show) return children;

	return (
		<Tooltip showOnNative>
			<CapabilityTooltipTrigger>{children}</CapabilityTooltipTrigger>
			<TooltipContent>
				<Text>{messages[hint]}</Text>
			</TooltipContent>
		</Tooltip>
	);
}
