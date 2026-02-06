import React from 'react';

import { cn } from '@wcpos/components/lib/utils';
import { Text } from '@wcpos/components/text';
import { VStack } from '@wcpos/components/vstack';

import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

/**
 *
 */
export const Tooltip = ({ active, payload, label }) => {
	const t = useT();
	const { format } = useCurrencyFormat();

	const getLabel = React.useCallback(
		(value) => {
			switch (value) {
				case 'total':
					return t('common.total');
				case 'total_tax':
					return t('common.total_tax');
				case 'order_count':
					return t('common.orders');
				default:
					return value;
			}
		},
		[t]
	);

	if (active && payload && payload.length) {
		return (
			<VStack
				className={cn(
					'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 border-border bg-popover shadow-foreground/5 web:animate-in web:fade-in-0 web:zoom-in-95 overflow-hidden rounded-md border px-3 py-1.5 shadow-md'
				)}
			>
				<Text className="font-semibold">{`${label}`}</Text>
				<Text className="text-primary">{`${getLabel(payload[0].name)}: ${format(payload[0].value)}`}</Text>
				<Text className="text-secondary">{`${getLabel(payload[1].name)}: ${format(payload[1].value)}`}</Text>
				<Text className="text-muted-foreground">{`${getLabel(payload[2].name)}: ${payload[2].value}`}</Text>
			</VStack>
		);
	}

	return null;
};
