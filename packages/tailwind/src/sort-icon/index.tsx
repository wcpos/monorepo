import * as React from 'react';

import { Icon } from '../icon';
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
		<VStack space="xs">
			<Icon name="caretUp" className="text-sm" />
			<Icon name="caretDown" className="text-sm" />
		</VStack>
	);
};
