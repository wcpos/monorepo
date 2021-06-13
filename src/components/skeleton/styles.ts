import styled, { css } from 'styled-components/native';

export const Container = styled.View<{ border: import('./skeleton').Borders }>`
	background-color: #e1e9ee;
	overflow: hidden;

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
