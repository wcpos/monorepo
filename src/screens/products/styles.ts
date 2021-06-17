import styled from 'styled-components/native';

export const Container = styled.View`
	height: 100%;
	flex-direction: row;
	flex: 1;
	padding: ${({ theme }) => `${theme.PAGE_MAIN_PADDING_Y} ${theme.PAGE_MAIN_PADDING_X}`};
`;
