import styled from 'styled-components/native';
import { Text as StyledText } from '../text/styles';

export const Container = styled.View`
	background-color: ${({ theme }) => theme.DIALOG_BACKGROUND_COLOR};
	width: ${({ theme }) => theme.DIALOG_WIDTH};
	min-width: ${({ theme }) => theme.DIALOG_MIN_WIDTH};
	border-radius: ${({ theme }) => theme.DIALOG_BORDER_RADIUS};
	shadow-offset: { width: 0, height: 1 };
	shadow-opacity: 0.22;
	shadow-radius: 7.5px;
	shadow-color: #000;
	elevation: 8;
`;

export const Header = styled.View`
	padding: 10px;
	flex-direction: row;
`;

export const HeaderText = styled(StyledText)`
	flex: 1;
`;

export const Section = styled.View`
	padding: 10px;
`;

export const Footer = styled.View`
	padding: 10px;
`;
