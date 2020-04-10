import styled from 'styled-components/native';

type Props = { theme: import('../../lib/theme/types').ThemeProps } & import('./text').Props;

export const StyledText = styled.Text<Props>`
	color: ${(props) => {
		switch (props.type) {
			case 'secondary':
				return props.theme.TEXT_COLOR_SECONDARY;
			case 'attention':
				return props.theme.TEXT_COLOR_ATTENTION;
			case 'critical':
				return props.theme.TEXT_COLOR_CRITICAL;
			case 'info':
				return props.theme.TEXT_COLOR_INFO;
			case 'success':
				return props.theme.TEXT_COLOR_SUCCESS;
			case 'warning':
				return props.theme.TEXT_COLOR_WARNING;
			case 'inverse':
				return props.theme.TEXT_COLOR_INVERSE;
			default:
				return props.theme.TEXT_COLOR;
		}
	}};
	font-family: ${(props) => props.theme.FONT_FAMILY};
	font-style: ${(props) => (props.italic ? 'italic' : 'normal')};
	font-weight: ${(props) => {
		switch (props.weight) {
			case 'bold':
				return props.theme.FONT_WEIGHT_BOLD;
			case 'light':
				return props.theme.FONT_WEIGHT_LIGHT;
			default:
				return props.theme.FONT_WEIGHT;
		}
	}};
	font-size: ${(props) => {
		switch (props.size) {
			case 'large':
				return props.theme.FONT_SIZE_LARGE;
			case 'small':
				return props.theme.FONT_SIZE_SMALL;
			default:
				return props.theme.FONT_SIZE;
		}
	}};
	text-align: ${(props) => (props.align ? props.align : 'left')};
	text-transform: ${(props) => (props.uppercase ? 'uppercase' : 'none')};
`;
