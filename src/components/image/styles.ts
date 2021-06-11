import styled, { css } from 'styled-components/native';

type Props = Pick<import('./image').ImageProps, 'border'>;

export const Image = styled.Image<Props>`
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;

	/** Border */
	${({ border, theme }) => {
		switch (border) {
			case 'rounded':
				return css`
					border-radius: ${theme.IMAGE_BORDER_RADIUS};
				`;
			case 'circular':
				return css`
					border-radius: 500px;
				`;
			default:
				return css`
					border-radius: 0px;
				`;
		}
	}}
`;

export const Container = styled.View`
	background-color: transparent;
	position: relative;
	overflow: hidden;
`;
