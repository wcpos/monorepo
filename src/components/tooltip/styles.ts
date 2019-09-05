import styled from 'styled-components/native';
import { StyledText } from '../text/styles';

type Props = { theme: import('../../lib/theme/types').ThemeProps } & import('./tooltip').Props;

export const TargetWrapper = styled.View<Props>``;

export const TooltipWrapper = styled.View<Props>`
	background-color: ${props => props.theme.TOAST_BACKGROUND_COLOR};
	border-radius: ${props => props.theme.TOAST_BORDER_RADIUS};
	padding: ${props => props.theme.TOAST_PADDING_Y} ${props => props.theme.TOAST_PADDING_X};
`;

export const TooltipText = styled(StyledText)<Props>`
	color: ${props => props.theme.TOAST_TEXT_COLOR};
`;
