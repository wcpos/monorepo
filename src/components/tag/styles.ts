import styled from 'styled-components/native';
import { Text } from '../text/text';

export const Tag = styled.View<{ disabled?: boolean }>`
	flex-direction: row;
	align-items: center;
	padding: ${({ theme }) => `${theme.TAG_PADDING_Y} ${theme.TAG_PADDING_X}`};
	border-radius: ${({ theme }) => theme.TAG_BORDER_RADIUS}
	background-color: ${({ theme, disabled }) =>
		disabled ? theme.TAG_BACKGROUND_DISABLED : theme.TAG_BACKGROUND_COLOR};
`;

export const Label = styled(Text)`
	color: ${({ theme }) => theme.TAG_TEXT_COLOR};
`;
