import styled from 'styled-components/native';

type TextProps = import('./text').Props;

// eslint-disable-next-line import/prefer-default-export
export const StyledText = styled.Text<TextProps>`
	color: ${({ type, theme }) => {
		switch (type) {
			case 'secondary':
				return theme.TEXT_COLOR_SECONDARY;
			case 'attention':
				return theme.TEXT_COLOR_ATTENTION;
			case 'critical':
				return theme.TEXT_COLOR_CRITICAL;
			case 'info':
				return theme.TEXT_COLOR_INFO;
			case 'success':
				return theme.TEXT_COLOR_SUCCESS;
			case 'warning':
				return theme.TEXT_COLOR_WARNING;
			case 'inverse':
				return theme.TEXT_COLOR_INVERSE;
			default:
				return theme.TEXT_COLOR;
		}
	}};
	font-family: ${({ theme }) => theme.FONT_FAMILY};
	font-style: ${({ italic }) => (italic ? 'italic' : 'normal')};
	font-weight: ${({ weight, theme }) => {
		switch (weight) {
			case 'bold':
				return theme.FONT_WEIGHT_BOLD;
			case 'light':
				return theme.FONT_WEIGHT_LIGHT;
			default:
				return theme.FONT_WEIGHT;
		}
	}};
	font-size: ${({ size, theme }) => {
		switch (size) {
			case 'large':
				return theme.FONT_SIZE_LARGE;
			case 'small':
				return theme.FONT_SIZE_SMALL;
			default:
				return theme.FONT_SIZE;
		}
	}};
	text-align: ${({ align }) => align || 'left'};
	text-transform: ${({ uppercase }) => (uppercase ? 'uppercase' : 'none')};
`;
