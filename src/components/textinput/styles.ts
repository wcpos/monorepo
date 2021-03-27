import styled from 'styled-components/native';

type ITextInputProps = import('./textinput').ITextInputProps;

export const Box = styled.View`
	flex-direction: row;
	align-items: center;
	background: ${({ theme }) => theme.SEGMENT_BACKGROUND_COLOR};
	border-width: ${({ theme }) => theme.SEGMENT_BORDER_WIDTH};
	border-color: ${({ theme }) => theme.SEGMENT_BORDER_COLOR};
	border-style: solid;
	border-radius: ${({ theme }) => theme.SEGMENT_BORDER_RADIUS};
	padding: ${({ theme }) => theme.SEGMENT_PADDING};
`;

export const TextInput = styled.TextInput<ITextInputProps>`
	flex: 1;
	align-self: center;
	font-size: ${({ theme }) => theme.INPUT_FONT_SIZE};
	padding: 0;
`;
