import styled from 'styled-components/native';
import { StyleSheet } from 'react-native';

type ButtonProps = import('./button').Props;
type BackgroundProps = Pick<ButtonProps, 'background' | 'type' | 'disabled'> & {
	pressed: boolean;
};

export const Background = styled.View<BackgroundProps>`
	background-color: ${({ background, type, theme, pressed }) => {
		if (background === 'clear' || background === 'outline') {
			return 'transparent';
		}
		switch (type) {
			// case 'secondary':
			// 	return hovered ? 'black' : theme.BUTTON_COLOR_SECONDARY;
			// case 'attention':
			// 	return focused ? 'black' : theme.BUTTON_COLOR_ATTENTION;
			case 'critical':
				return pressed ? 'black' : theme.BUTTON_COLOR_CRITICAL;
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

	opacity: ${({ disabled }) => (disabled ? 0.5 : 1)}
	border-radius: ${({ theme }) => theme.BUTTON_BORDER_RADIUS};
	border-width: ${({ background }) => (background === 'outline' ? StyleSheet.hairlineWidth : 0)};
	padding: ${({ theme }) => theme.BUTTON_PADDING_Y} ${({ theme }) => theme.BUTTON_PADDING_X};
	flex-direction: row;
	align-items: center;
`;

type ButtonGroupProps = import('./group').ButtonGroupProps;

export const Group = styled.View<ButtonGroupProps>`
	flex-direction: row;
	justify-content: ${({ alignment }) => {
		switch (alignment) {
			case 'start':
				return 'flex-start';
			case 'end':
				return 'flex-end';
			default:
				return 'center';
		}
	}};
`;

export const GroupChild = styled.View<ButtonGroupProps & { last: boolean }>`
	margin-end: ${({ last }) => (last ? '0' : '10px')};
	flex: ${({ alignment }) => (alignment === 'fill' ? 1 : 0)};
`;
