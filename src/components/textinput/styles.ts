import styled from 'styled-components/native';

type Props = import('./textinput').Props;

export const Box = styled.View<Props>`
	flex-direction: row;
	align-items: center;
	background: ${(props) => props.theme.SEGMENT_BACKGROUND_COLOR};
	border-width: ${(props) => props.theme.SEGMENT_BORDER_WIDTH};
	border-color: ${(props) => props.theme.SEGMENT_BORDER_COLOR};
	border-style: solid;
	border-radius: ${(props) => props.theme.SEGMENT_BORDER_RADIUS};
	padding: ${(props) => props.theme.SEGMENT_PADDING};
`;

export const Input = styled.TextInput<Props>`
	flex: 1;
	align-self: center;
	font-size: ${(props) => props.theme.INPUT_FONT_SIZE};
	padding: 0;
`;
