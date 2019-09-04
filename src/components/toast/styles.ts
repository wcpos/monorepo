import styled from 'styled-components/native';
import { StyledText } from '../text/styles';

type Props = { theme: import('../../lib/theme/types').ThemeProps } & import('./toast').Props;

export const Container = styled.View<Props>`
	position: absolute;
	top: 0;
	left: 0;
	bottom: 0;
	right: 0;
	background-color: transparent;
	justify-content: center;
	align-items: center;
	z-index: ${props => props.theme.TOAST_Z_INDEX};
`;

export const InnerContainer = styled.View<Props>`
	background-color: transparent;
`;

export const Wrapper = styled.View<Props>`
	align-items: center;
	background-color: ${props => props.theme.TOAST_BACKGROUND_COLOR};
	min-width: 100;
	border-radius: ${props => props.theme.TOAST_BORDER_RADIUS};
	padding: ${props => props.theme.TOAST_PADDING_Y} ${props => props.theme.TOAST_PADDING_X};
`;

export const Text = styled(StyledText)<Props>`
	color: ${props => props.theme.TOAST_TEXT_COLOR};
`;
