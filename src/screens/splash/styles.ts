import styled from 'styled-components/native';

export const Container = styled.View`
	width: 100%;
	align-items: center;
	justify-content: center;
	padding: ${({ theme }) => `${theme.PAGE_MAIN_PADDING_Y} ${theme.PAGE_MAIN_PADDING_X}`};
`;
