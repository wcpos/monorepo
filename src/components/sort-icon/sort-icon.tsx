import * as React from 'react';
import * as Styled from './styles';

type SortDirection = import('../table/types').SortDirection;

export interface SortIconProps {
	/**
	 *
	 */
	direction?: SortDirection;
	/**
	 *
	 */
	visible?: boolean;
}

export const SortIcon = ({ direction, visible = true }: SortIconProps) => {
	return (
		<Styled.Container visible={visible}>
			<Styled.Up active={direction === 'asc'} />
			<Styled.Down active={direction === 'desc'} />
		</Styled.Container>
	);
};
