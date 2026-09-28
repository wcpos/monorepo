import * as React from 'react';

import { Icon } from '../icon';

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

export function SortIcon({ direction, hovered = false }: SortIconProps) {
	return (
		<Icon
			name={direction === 'desc' ? 'caretDown' : 'caretUp'}
			size="xs"
			className={
				direction ? 'text-foreground' : hovered ? 'text-muted-foreground' : 'text-transparent'
			}
		/>
	);
}
