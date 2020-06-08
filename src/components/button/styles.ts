import styled from 'styled-components/native';
import { StyleSheet } from 'react-native';

type Props = { theme: import('../../lib/theme/types').ThemeProps } & import('./button').Props;

export const ButtonView = styled.View<Props>`
	background-color: ${({ background, type, theme }) => {
		if (background === 'clear' || background === 'outline') {
			return 'transparent';
		}
		switch (type) {
			case 'secondary':
				return theme.BUTTON_COLOR_SECONDARY;
			case 'attention':
				return theme.BUTTON_COLOR_ATTENTION;
			case 'critical':
				return theme.BUTTON_COLOR_CRITICAL;
			case 'info':
				return theme.BUTTON_COLOR_INFO;
			case 'success':
				return theme.BUTTON_COLOR_SUCCESS;
			case 'warning':
				return theme.BUTTON_COLOR_WARNING;
			case 'inverse':
				return theme.BUTTON_COLOR_INVERSE;
			default:
				return theme.BUTTON_COLOR;
		}
	}};

	border-color: ${({ type, theme }) => {
		switch (type) {
			case 'secondary':
				return theme.BUTTON_COLOR_SECONDARY;
			case 'attention':
				return theme.BUTTON_COLOR_ATTENTION;
			case 'critical':
				return theme.BUTTON_COLOR_CRITICAL;
			case 'info':
				return theme.BUTTON_COLOR_INFO;
			case 'success':
				return theme.BUTTON_COLOR_SUCCESS;
			case 'warning':
				return theme.BUTTON_COLOR_WARNING;
			case 'inverse':
				return theme.BUTTON_COLOR_INVERSE;
			default:
				return theme.BUTTON_COLOR;
		}
	}};
	border-radius: ${({ theme }) => theme.BUTTON_BORDER_RADIUS};
	border-width: ${({ background }) => (background === 'outline' ? StyleSheet.hairlineWidth : 0)};
	padding: ${({ theme }) => theme.BUTTON_PADDING_Y} ${({ theme }) => theme.BUTTON_PADDING_X};
`;

export const Group = styled.View<Props>``;
