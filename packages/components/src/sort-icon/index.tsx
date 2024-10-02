import * as React from 'react';

import { Icon } from '../icon';
import { cn } from '../lib/utils';
import { VStack } from '../vstack';

export interface SortIconProps {
	/**
	 *
	 */
	direction?: 'asc' | 'desc';
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
					'-mb-0.5',
					direction === 'asc' ? 'text-base' : hovered ? 'text-gray-300' : 'text-transparent'
				)}
			/>
			<Icon
				name="caretDown"
				size="xs"
				className={cn(
					'-mt-0.5',
					direction === 'desc' ? 'text-base' : hovered ? 'text-gray-300' : 'text-transparent'
				)}
			/>
		</VStack>
	);
};
