import styled, { css } from 'styled-components/native';

type ItemProps = Pick<import('./item').ItemProps, 'border'>;

export const Item = styled.View<ItemProps>`
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
