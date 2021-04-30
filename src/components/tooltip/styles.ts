import styled from 'styled-components/native';
import StyledText from '../text';

export const Container = styled.View`
	background-color: ${({ theme }) => theme.TOAST_BACKGROUND_COLOR};
	border-radius: ${({ theme }) => theme.TOAST_BORDER_RADIUS};
	padding: ${({ theme }) => `${theme.TOAST_PADDING_Y} ${theme.TOAST_PADDING_X}`};
`;

export const Text = styled(StyledText)`
	color: ${({ theme }) => theme.TOAST_TEXT_COLOR};
`;
