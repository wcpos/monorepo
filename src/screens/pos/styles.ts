import styled from 'styled-components/native';

export const Container = styled.View`
	height: 100%;
	flex-direction: row;
	padding: ${({ theme }) => `${theme.PAGE_MAIN_PADDING_Y} ${theme.PAGE_MAIN_PADDING_X}`};
`;

export const ProductsColumn = styled.View`
	height: 100%;
	flex-grow: 0;
	flex-shrink: 0;
	flex-basis: 60%;
`;

export const CartColumn = styled.View`
	height: 100%;
	flex: 1;
`;
