import styled from 'styled-components/native';

type Props = { theme: import('../../lib/theme/types').ThemeProps } & import('./button').Props;

export const ButtonView = styled.View<Props>`
	background-color: ${props => {
		if (props.background === 'clear' || props.background === 'outline') {
			return 'transparent';
		}
		switch (props.type) {
			case 'secondary':
				return props.theme.BUTTON_COLOR_SECONDARY;
			case 'attention':
				return props.theme.BUTTON_COLOR_ATTENTION;
			case 'critical':
				return props.theme.BUTTON_COLOR_CRITICAL;
			case 'info':
				return props.theme.BUTTON_COLOR_INFO;
			case 'success':
				return props.theme.BUTTON_COLOR_SUCCESS;
			case 'warning':
				return props.theme.BUTTON_COLOR_WARNING;
			case 'inverse':
				return props.theme.BUTTON_COLOR_INVERSE;
			default:
				return props.theme.BUTTON_COLOR;
		}
	}};

	border-color: ${props => {
		switch (props.type) {
			case 'secondary':
				return props.theme.BUTTON_COLOR_SECONDARY;
			case 'attention':
				return props.theme.BUTTON_COLOR_ATTENTION;
			case 'critical':
				return props.theme.BUTTON_COLOR_CRITICAL;
			case 'info':
				return props.theme.BUTTON_COLOR_INFO;
			case 'success':
				return props.theme.BUTTON_COLOR_SUCCESS;
			case 'warning':
				return props.theme.BUTTON_COLOR_WARNING;
			case 'inverse':
				return props.theme.BUTTON_COLOR_INVERSE;
			default:
				return props.theme.BUTTON_COLOR;
		}
	}};
	border-radius: ${props => props.theme.BUTTON_BORDER_RADIUS};
	border-width: ${props => (props.background === 'outline' ? '1px' : 'none')};
	padding: ${props => props.theme.BUTTON_PADDING_Y} ${props => props.theme.BUTTON_PADDING_X};
`;
