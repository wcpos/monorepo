import * as React from 'react';

import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { VStack } from '../vstack';

type SortDirection = import('../table').SortDirection;

export interface SortIconProps {
	/**
	 *
	 */
	direction?: SortDirection;
	/**
	 *
	 */
	hovered?: boolean;
}

export const SortIcon = ({ direction, hovered = false }: SortIconProps) => {
	return (
		<VStack className="gap-0">
			<Icon
				name="caretUp"
				size="xs"
				className={cn(
					direction === 'asc' ? 'fill-primary' : hovered ? 'fill-foreground' : 'fill-transparent'
				)}
			/>
			<Icon
				name="caretDown"
				size="xs"
				className={cn(
					direction === 'desc' ? 'fill-primary' : hovered ? 'fill-foreground' : 'fill-transparent'
				)}
			/>
		</VStack>
	);
};
