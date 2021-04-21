import * as React from 'react';
import * as Styled from './styles';

type SortDirection = import('../table/types').SortDirection;

export interface SortIconProps {
	/**
	 *
	 */
	direction?: SortDirection;
}

export const SortIcon = ({ direction }: SortIconProps) => {
	return (
		<Styled.Container>
			<Styled.Up active={direction !== 'desc'} />
			<Styled.Down active={direction !== 'asc'} />
		</Styled.Container>
	);
};
