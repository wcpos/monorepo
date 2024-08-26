import styled from 'styled-components/native';

export const Container = styled.View`
	padding: 3px;
	opacity: 0.6;
`;

export const Up = styled.View<{ active: boolean; hovered: boolean }>`
	border-left-width: 4px;
	border-right-width: 4px;
	border-bottom-width: 4px;
	border-bottom-color: ${({ active, theme, hovered }) => {
		if (active) {
			return theme.colors.primary;
		}
		if (hovered) {
			return theme.colors.disabled;
		}
		return 'transparent';
	}};
	border-left-color: transparent;
	border-right-color: transparent;
	margin-bottom: 2px;
`;

export const Down = styled.View<{ active: boolean; hovered: boolean }>`
	border-left-width: 4px;
	border-right-width: 4px;
	border-top-width: 4px;
	border-top-color: ${({ active, theme, hovered }) => {
		if (active) {
			return theme.colors.primary;
		}
		if (hovered) {
			return theme.colors.disabled;
		}
		return 'transparent';
	}};
	border-left-color: transparent;
	border-right-color: transparent;
`;
