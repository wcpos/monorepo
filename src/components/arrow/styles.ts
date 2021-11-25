import styled, { css } from 'styled-components/native';

type ArrowProps = import('./arrow').ArrowProps;

const sizes = {
	small: 8,
	large: 20,
	default: 12,
};

export const Container = styled.View<Pick<ArrowProps, 'direction' | 'size'>>`
	width: ${({ size }) => sizes[size || 'default']}px;
	height: ${({ size }) => sizes[size || 'default']}px;

	/** Hack to get arrow in the right position */
	${({ direction }) =>
		direction === 'up' &&
		css`
			flex-direction: row;
		`}}
`;

export const Left = styled.View<Pick<ArrowProps, 'size' | 'color'>>`
	border-top-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-bottom-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-right-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-right-color: ${({ theme, color }) => color || theme.COLOR_PRIMARY};
	border-top-color: transparent;
	border-bottom-color: transparent;
`;

export const Right = styled.View<Pick<ArrowProps, 'size' | 'color'>>`
	border-top-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-bottom-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-left-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-left-color: ${({ theme, color }) => color || theme.COLOR_PRIMARY};
	border-top-color: transparent;
	border-bottom-color: transparent;
`;

export const Up = styled.View<Pick<ArrowProps, 'size' | 'color'>>`
	border-left-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-right-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-bottom-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-bottom-color: ${({ theme, color }) => color || theme.COLOR_PRIMARY};
	border-left-color: transparent;
	border-right-color: transparent;
`;

export const Down = styled.View<Pick<ArrowProps, 'size' | 'color'>>`
	border-left-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-right-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-top-width: ${({ size }) => sizes[size || 'default'] / 2}px;
	border-top-color: ${({ theme, color }) => color || theme.COLOR_PRIMARY};
	border-left-color: transparent;
	border-right-color: transparent;
`;
